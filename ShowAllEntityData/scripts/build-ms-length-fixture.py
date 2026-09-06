"""Build the two release-tracks fixtures that need MusicBrainz's embedded payload.

  tests/fixtures/release-tracks-ms-length.html
  tests/fixtures/release-tracks-recording-length-match.html

The Playwright snapshot capture strips every <script> tag, so
tests/snapshots/release-tracks/raw.html — the real native Born to Run page —
has lost the embedded JSON payload the millisecond feature reads. This
reassembles the two: raw.html's DOM plus a MINIMAL release payload rebuilt
from the same release's real data in debug/btr-bug.html (same release gid,
verified by scripts/check-btr-identity.py).

Only the fields the feature actually reads are kept, so the fixture stays
reviewable: release.mediums[].tracks[].{number, position, length,
recording.gid, recording.length}.

recording.length is read by the SEPARATE "Recording length" column
(_buildReleaseRecordingLengthMap/_releaseHasDifferingRecordingLength), not by
the millisecond Length feature — which reads tracks[].length and must never
read this one. It has to be carried anyway: without it the fixture's every
recording looks length-less, and the column that is supposed to appear on this
release (six of its eight tracks disagree) silently never would.
"""
import copy
import io
import json
import re

RAW = 'tests/snapshots/release-tracks/raw.html'
SRC = 'debug/btr-bug.html'
OUT = 'tests/fixtures/release-tracks-ms-length.html'
OUT_MATCH = 'tests/fixtures/release-tracks-recording-length-match.html'

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
            'recording': {'gid': rec.get('gid'), 'length': rec.get('length')},
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
    '    _buildReleaseRecordingLengthMap() and _buildReleaseTrackLengthMap()\n'
    '    read between them.\n'
    '\n'
    '    Note tracks[].length is deliberately the TRACK length, not\n'
    '    tracks[].recording.length: six of this release\'s eight tracks differ\n'
    '    between the two, one by three seconds, and MusicBrainz renders the\n'
    '    track value. Both are carried here because they feed two different\n'
    '    columns — tracks[].length is the native "Length", and\n'
    '    tracks[].recording.length is the "Recording length" column added\n'
    '    beside it precisely because the two disagree on this release.\n'
    '-->\n'
)


def write_fixture(path, data, note):
    """Wraps one payload in raw.html's DOM and writes it out.

    @param path  Destination fixture file.
    @param data  The minimal release payload to inline.
    @param note  Fixture-specific comment appended to the shared banner.
    @return      Byte length of the file written.
    """
    tag = '<script type="application/json">' + json.dumps(data, separators=(',', ':')) + '</script>\n'
    body = banner + note + tag
    text = raw.replace('</body>', body + '</body>', 1) if '</body>' in raw else raw + body
    io.open(path, 'w', encoding='utf-8', newline='\n').write(text)
    return len(text)


DIFFER_NOTE = (
    '<!--\n'
    "    MusicBrainz's real values, untouched: six of the eight tracks have a\n"
    '    recording length that differs from their track length, so the\n'
    '    "Recording length" column IS added on this fixture.\n'
    '-->\n'
)

MATCH_NOTE = (
    '<!--\n'
    '    The OTHER side of the _releaseHasDifferingRecordingLength() gate.\n'
    '\n'
    '    Same DOM and the same track lengths, but every recording length is\n'
    '    forced EQUAL to its own track length, so there is nothing to disagree\n'
    '    about and the "Recording length" column must NOT be added at all\n'
    '    rather than render as an exact copy of "Length".\n'
    '\n'
    '    Forced rather than taken from a release that genuinely agrees (several\n'
    '    do — see scripts/scan-track-vs-recording-length.py) because the payload\n'
    '    has to keep keying THIS DOM: the rows are matched by recording MBID,\n'
    '    so another release\'s payload would match nothing and the column would\n'
    '    be absent for the wrong reason, passing the test while proving nothing.\n'
    '-->\n'
)

wrote = write_fixture(OUT, minimal, DIFFER_NOTE)

matching = copy.deepcopy(minimal)
for med in matching['release']['mediums']:
    for t in med['tracks']:
        t['recording']['length'] = t['length']
wrote_match = write_fixture(OUT_MATCH, matching, MATCH_NOTE)

lens = [(t['number'], t['length'], t['recording']['length'])
        for m in minimal['release']['mediums'] for t in m['tracks']]
differing = sum(1 for _, tl, rl in lens if rl is not None and rl != tl)
print(f'wrote {OUT} ({wrote} bytes)')
print('track / recording lengths:', lens)
print(f'{differing} of {len(lens)} tracks differ — "Recording length" column expected')
print(f'wrote {OUT_MATCH} ({wrote_match} bytes) — recording lengths forced equal, no column expected')
