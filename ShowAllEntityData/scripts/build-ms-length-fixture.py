"""Build tests/fixtures/release-tracks-ms-length.html.

The Playwright snapshot capture strips every <script> tag, so
tests/snapshots/release-tracks/raw.html — the real native Born to Run page —
has lost the embedded JSON payload the millisecond feature reads. This
reassembles the two: raw.html's DOM plus a MINIMAL release payload rebuilt
from the same release's real data in debug/btr-bug.html (same release gid,
verified by scripts/check-btr-identity.py).

Only the fields the feature actually reads are kept, so the fixture stays
reviewable: release.mediums[].tracks[].{number, position, length,
recording.gid}.
"""
import io
import json
import re

RAW = 'tests/snapshots/release-tracks/raw.html'
SRC = 'debug/btr-bug.html'
OUT = 'tests/fixtures/release-tracks-ms-length.html'

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
    for t in med.get('tracks') or []:
        rec = t.get('recording') or {}
        tracks.append({
            'number': t.get('number'),
            'position': t.get('position'),
            'length': t.get('length'),
            'recording': {'gid': rec.get('gid')},
        })
    minimal['release']['mediums'].append({'position': med.get('position'), 'tracks': tracks})

raw = io.open(RAW, encoding='utf-8', errors='replace').read()
assert '<script' not in raw, 'raw.html unexpectedly contains a <script> tag'

banner = (
    '\n<!--\n'
    '    Injected by scripts/build-ms-length-fixture.py.\n'
    '\n'
    '    MusicBrainz inlines its tracklist component props as this\n'
    '    <script type="application/json"> blob, and it carries the exact\n'
    '    millisecond length of every track — the value MusicBrainz itself only\n'
    '    ever DISPLAYS rounded to the nearest second. The surrounding DOM is\n'
    '    tests/snapshots/release-tracks/raw.html (the real native "Born to Run"\n'
    '    page, release 1d404e1d-fcb6-3a52-b478-e706e893c897); the snapshot\n'
    '    capture strips every <script>, so this payload is rebuilt from the same\n'
    '    release\'s real data in debug/btr-bug.html, trimmed to just the fields\n'
    '    _buildReleaseTrackLengthMap() reads.\n'
    '\n'
    '    Note tracks[].length is deliberately the TRACK length, not\n'
    '    tracks[].recording.length: four of this release\'s eight tracks differ\n'
    '    between the two, one by three seconds, and MusicBrainz renders the\n'
    '    track value.\n'
    '-->\n'
)
script_tag = '<script type="application/json">' + json.dumps(minimal, separators=(',', ':')) + '</script>\n'

if '</body>' in raw:
    out = raw.replace('</body>', banner + script_tag + '</body>', 1)
else:
    out = raw + banner + script_tag

io.open(OUT, 'w', encoding='utf-8', newline='\n').write(out)

lens = [(t['number'], t['length']) for m in minimal['release']['mediums'] for t in m['tracks']]
print(f'wrote {OUT} ({len(out)} bytes)')
print('track lengths:', lens)
