#!/usr/bin/env python3
"""Build tests/fixtures/sidebar-picture-instrument-recordings.html.

The instrument-recordings fixture of the "Recording of" specs
(recording-of-pt-instrument-recordings.html, the banjitar, which has no
IROMBOOK drawing) with the sidebar picture block MusicBrainz renders for an
instrument that has one, copied verbatim from debug/electric-bass-guitar.html
(/instrument/0b9d87fa-93fa-4956-8b6a-a419566cc915/recordings): a
`div.picture` as the first child of `#sidebar`. Used by
tests/fixtures/sidebar-picture.spec.js ("an instrument's IROMBOOK drawing").

Run from ShowAllEntityData/: python3 scripts/build-sidebar-picture-instrument-fixture.py
"""
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / 'tests/fixtures/recording-of-pt-instrument-recordings.html'
SNAP = ROOT / 'debug/electric-bass-guitar.html'
OUT = ROOT / 'tests/fixtures/sidebar-picture-instrument-recordings.html'
# Fallback when the (gitignored) snapshot is not on this machine: the block as
# it was in the snapshot on 2026-10-20.
BLOCK = ('<div class="picture"><img src="https://static.metabrainz.org/irombook/'
         'bass_guitar/bass_guitar_electric.png"><br><span class="picture-note">'
         'IROMBOOK image/IROMBOOKのイラスト</span></div>')


def main():
    """Insert the picture block at the start of #sidebar and write the fixture."""
    block = BLOCK
    if SNAP.exists():
        m = re.search(r'<div id="sidebar">(<div class="picture">.*?</span></div>)',
                      SNAP.read_text(encoding='utf-8'))
        if not m:
            sys.exit('no picture block in the snapshot')
        block = m.group(1)
    html = SRC.read_text(encoding='utf-8')
    if html.count('<div id="sidebar">') != 1:
        sys.exit('expected exactly one #sidebar in the source fixture')
    html = html.replace('<div id="sidebar">', '<div id="sidebar">' + block, 1)
    OUT.write_text(html, encoding='utf-8')
    print(f'wrote {OUT.relative_to(ROOT)} ({len(html)} bytes)')


if __name__ == '__main__':
    main()
