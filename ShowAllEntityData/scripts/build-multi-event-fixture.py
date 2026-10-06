#!/usr/bin/env python3
"""Adds the recording comments to tests/fixtures/release-tracks-multi-event.html.

Source: release d390b4ff-38ab-4783-99ef-2c4d338e016b "Berlin Night", saved as
the server sent it by

    node scripts/fetch-release-fixture.js d390b4ff-38ab-4783-99ef-2c4d338e016b \
        tests/fixtures/release-tracks-multi-event.html

The server HTML carries no recording comment after a track's recording link:
MusicBrainz's own scripts render it client-side from the page's embedded
release JSON, and the fixture harness does not run them. Without it the
release-tracks pipeline builds no "Disambiguation" column, and
org/live-bootleg.org item 3 has nothing to compare. This script inserts
each track's REAL comment, taken from that same JSON
(release.mediums[].tracks[].recording.comment), in MusicBrainz's own markup
right after the recording link — the shape
scripts/build-recording-comments-fixture.py injects for the same reason.

Idempotent: a link already followed by a comment span is left alone.

Also used for tests/fixtures/release-tracks-brixton-night.html (release
e384f062-85a3-4141-9122-0814d987cda3, four events on CD 3), fetched the same
way and passed as the argument.

Usage: python3 scripts/build-multi-event-fixture.py [fixture.html]
"""

import html
import json
import pathlib
import re
import sys

HERE = pathlib.Path(__file__).resolve().parent.parent
FIXTURE = pathlib.Path(sys.argv[1]).resolve() if len(sys.argv) > 1 else HERE / 'tests' / 'fixtures' / 'release-tracks-multi-event.html'

LINK_RE = re.compile(r'(<a href="/recording/([0-9a-f-]{36})"><bdi>[^<]*</bdi></a>)(?! <span class="comment">)')


def comments_by_recording(page):
    """Recording gid -> comment, from the embedded release JSON."""
    for blob in re.findall(r'<script[^>]*type="application/json"[^>]*>(.*?)</script>', page, re.S):
        if '"mediums"' not in blob:
            continue
        data = json.loads(blob)
        rel = data.get('release') or {}
        if not rel.get('mediums'):
            continue
        out = {}
        for med in rel['mediums']:
            for t in med.get('tracks') or []:
                rec = t.get('recording') or {}
                if rec.get('gid') and rec.get('comment'):
                    out[rec['gid']] = rec['comment']
        return out
    sys.exit(f'no release payload in {FIXTURE}')


def main():
    """Inserts the comments and rewrites the fixture."""
    page = FIXTURE.read_text(encoding='utf-8')
    comments = comments_by_recording(page)
    hits = 0

    def add(m):
        nonlocal hits
        text = comments.get(m.group(2))
        if not text:
            return m.group(0)
        hits += 1
        return f'{m.group(1)} <span class="comment">(<bdi>{html.escape(text, quote=False)}</bdi>)</span>'

    out = LINK_RE.sub(add, page)
    FIXTURE.write_text(out, encoding='utf-8')
    print(f'{FIXTURE.relative_to(HERE)}: {len(comments)} commented recordings, {hits} links annotated')


if __name__ == '__main__':
    main()
