#!/usr/bin/env python3
"""Builds tests/fixtures/artist-releasegroups-live-titles.html.

Source: tests/snapshots/artist-releasegroups/raw.html, page 1 of an artist's
"all release groups" view, which carries eleven real live-bootleg release
group titles written with MusicBrainz's U+2010 hyphen
("1975‐02‐05: The Main Point, Bryn Mawr, PA, USA", ...).

The snapshot is page 1 of 22. Served as a fixture as it is, the "Show all"
fetch would request pages 2..22 and get the same page back each time, so
every row would appear 22 times. This script removes the two
<ul class="pagination"> widgets and nothing else, so the page reads as a
single page and the row markup stays byte-for-byte MusicBrainz's own.

Usage: python3 scripts/build-live-titles-fixture.py
"""

import pathlib
import re
import sys

HERE = pathlib.Path(__file__).resolve().parent.parent
SRC = HERE / 'tests' / 'snapshots' / 'artist-releasegroups' / 'raw.html'
DST = HERE / 'tests' / 'fixtures' / 'artist-releasegroups-live-titles.html'

PAGINATION_RE = re.compile(r'<ul class="pagination">.*?</ul>', re.S)


def main():
    """Strips the pagination widgets from the snapshot and writes the fixture."""
    html = SRC.read_text(encoding='utf-8')
    out, n = PAGINATION_RE.subn('', html)
    if n != 2:
        sys.exit(f'expected 2 pagination widgets in {SRC}, found {n}')
    if 'page=2' in out:
        sys.exit('a page=2 link survived; the fixture would still paginate')
    DST.write_text(out, encoding='utf-8')
    print(f'wrote {DST.relative_to(HERE)} ({len(out)} bytes, removed {n} pagination widgets)')


if __name__ == '__main__':
    main()
