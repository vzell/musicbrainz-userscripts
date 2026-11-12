#!/usr/bin/env python3
"""Builds the Brucebase stats page fixtures (`bb-stats`, org/brucebase.org
Phase 13, batch 1) from a copy of the mirror's stats folder, one page per
shape scripts/check-bb-stats-reader.js found (2026-11-12):

  venues-in-kentucky              a list of mixed kinds (venues, gigs, no gigs)
                                  in named tabs; venues in sort form
  songs-official-video            a list of songs in letter tabs
  relations-bands                 a list of names in sort form ("Band, The")
  awards                          tables in tabs; a heading row bold by its
                                  style; ceremony rows (the Section column)
  set-openers-and-closers         one heading-only table, then a table per
                                  tour with a caption row
  songs-by-album                  both shapes: a list and tables
  4th-of-july-asbury-park-sandy-tour   neither shape: stays bb-page
  awards-ama                      a fragment of stats:awards with a table of
                                  its own: stays bb-page (vzell's answer 8)
  for-collectors                  a hub: its items link other stats pages, the
                                  wiki's navigation; stays bb-page

Written as tests/fixtures/bb-stats-<name>.html. Scripts, noscripts and
theme @imports are removed (scripts/build-bb-event-fixtures.py's
`strip()`); no wiki member is named (no `printuser`; checked here).

    python3 scripts/build-bb-stats-fixtures.py [stats_dir]
    stats_dir: debug/bb-mirror/stats (scripts/copy-bb-stats-sample.sh), or
               the mirror's own stats folder
"""
import importlib.util
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
OUT = os.path.join(ROOT, 'tests', 'fixtures')
SRC = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, 'debug', 'bb-mirror', 'stats')
PAGES = [
    'venues-in-kentucky',
    'songs-official-video',
    'relations-bands',
    'awards',
    'set-openers-and-closers',
    'songs-by-album',
    '4th-of-july-asbury-park-sandy-tour',
    'awards-ama',
    'for-collectors',
]


def _strip():
    """scripts/build-bb-event-fixtures.py's `strip()` (a hyphenated module name)."""
    spec = importlib.util.spec_from_file_location('build_bb_event_fixtures', os.path.join(HERE, 'build-bb-event-fixtures.py'))
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod.strip


def main():
    """Writes each fixture whose source page is on the machine."""
    strip = _strip()
    wrote = 0
    for name in PAGES:
        src = os.path.join(SRC, f'stats_{name}.html')
        if not os.path.exists(src):
            print(f'skip {name}: {src} not on this machine')
            continue
        with open(src, encoding='utf-8', errors='replace') as fh:
            html = strip(fh.read())
        if 'id="page-content"' not in html:
            sys.exit(f'{src}: no #page-content')
        if 'printuser' in html:
            sys.exit(f'{src}: names a wiki member (printuser)')
        note = ('<!-- Built by scripts/build-bb-stats-fixtures.py from the BruceParser mirror; scripts, noscripts and '
                'theme @imports removed; do not edit by hand. -->\n')
        html = re.sub(r'(<!DOCTYPE[^>]*>\s*)', lambda m: m.group(1) + note, html, count=1, flags=re.I)
        target = os.path.join(OUT, f'bb-stats-{name}.html')
        with open(target, 'w', encoding='utf-8', newline='\n') as fh:
            fh.write(html)
        wrote += 1
        print(f'wrote {os.path.relpath(target, ROOT)} ({len(html):,} bytes)')
    print(f'{wrote} of {len(PAGES)} fixtures written')
    return 0


if __name__ == '__main__':
    sys.exit(main())
