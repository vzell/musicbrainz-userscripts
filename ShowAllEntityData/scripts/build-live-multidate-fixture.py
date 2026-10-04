#!/usr/bin/env python3
"""Builds tests/fixtures/releasegroup-releases-live-multidate.html.

Source: tests/fixtures/releasegroup-releases-live-titles.html (the hand-made
"Live Title Test" release group: an Official and a Bootleg sub-table). Its
counts are pinned by several specs, so the multi-date titles of
org/live-bootleg.org 2 get a copy of their own instead of extra rows there.

The copy keeps the Official sub-table and the Bootleg sub-table's trailing
RECORDING-link row (a live-shaped title that must never count) unchanged,
gives Bootleg releases 4..12 the titles in TITLES, and drops Bootleg releases
13..17. Row markup stays the source's own; only <bdi> text changes.

Usage: python3 scripts/build-live-multidate-fixture.py
"""

import pathlib
import re
import sys

HERE = pathlib.Path(__file__).resolve().parent.parent
SRC = HERE / 'tests' / 'fixtures' / 'releasegroup-releases-live-titles.html'
DST = HERE / 'tests' / 'fixtures' / 'releasegroup-releases-live-multidate.html'

# Release number -> new title. Keep in step with
# tests/fixtures/uvd-live-titles.spec.js' MULTI_* lists.
TITLES = {
    4: '1978‐08‐21/22/23: Madison Square Garden, New York City, NY, USA',
    5: '1977‐03‐22/23/24/25: Music Hall, Boston, MA, USA',
    6: '1978‐08‐21: Madison Square Garden, New York City, NY, USA / 1979‐01‐01: Nassau Coliseum, Uniondale, NY, USA',
    7: '1989‐07‐04 / 1990‐04‐22: Park West, Chicago, IL, USA',
    8: '1977‐04‐30/31: Music Hall, Boston, MA, USA',
    9: '1978‐08‐21: Madison Square Garden, New York City, NY, USA / 1979‐02‐30: Nassau Coliseum, Uniondale, NY, USA',
    10: '1977‐03‐22/2: Music Hall, Boston, MA, USA',
    11: '2001‐01‐01: Venue A / Venue B, City, Country',
    12: '1975‐02‐05: The Main Point, Bryn Mawr, PA, USA',
}
DROP = range(13, 18)

ROW_RE = re.compile(r'[ \t]*<tr class="(?:odd|even)">\n.*?</tr>\n', re.S)
ID_RE = re.compile(r'href="/release/000000(\d\d)-')
BDI_RE = re.compile(r'(href="/release/[0-9a-f-]{36}"><bdi>)[^<]*(</bdi>)')


def rewrite(m):
    """Retitles, drops or keeps one <tr> of the source."""
    row = m.group(0)
    idm = ID_RE.search(row)
    if not idm:
        return row
    n = int(idm.group(1))
    if n in DROP:
        return ''
    if n in TITLES:
        out, k = BDI_RE.subn(lambda b: b.group(1) + TITLES[n] + b.group(2), row, count=1)
        if k != 1:
            sys.exit(f'release {n}: no title <bdi> found')
        return out
    return row


def main():
    """Writes the multi-date fixture."""
    html = SRC.read_text(encoding='utf-8')
    out = ROW_RE.sub(rewrite, html)
    for n, title in TITLES.items():
        if title not in out:
            sys.exit(f'release {n}: title missing from the output')
    for n in DROP:
        if f'/release/000000{n:02d}-' in out:
            sys.exit(f'release {n}: row was not dropped')
    out = out.replace('<bdi>Live Title Test</bdi>', '<bdi>Live Multi-Date Test</bdi>')
    DST.write_text(out, encoding='utf-8')
    print(f'wrote {DST.relative_to(HERE)} ({len(out)} bytes)')


if __name__ == '__main__':
    main()
