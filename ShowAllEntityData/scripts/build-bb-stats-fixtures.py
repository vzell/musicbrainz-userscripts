#!/usr/bin/env python3
"""Builds the Brucebase stats page fixtures (`bb-stats`, org/brucebase.org
Phase 13, batch 1; `bb-song-tours` and `bb-sessions`, batch 2) from a copy of
the mirror's stats folder, one page per shape scripts/check-bb-stats-reader.js
and scripts/check-bb-tours-sessions.js found (2026-11-12; batch 3: `bb-gallery`,
`bb-registered`):

  venues-in-kentucky              a list of mixed kinds (venues, gigs, no gigs)
                                  in named tabs; venues in sort form
  songs-official-video            a list of songs in letter tabs
  relations-bands                 a list of names in sort form ("Band, The")
  awards                          tables in tabs; a heading row bold by its
                                  style; ceremony rows (the Section column)
  set-openers-and-closers         one heading-only table, then a table per
                                  tour with a caption row
  songs-by-album                  both shapes: a list and tables
  4th-of-july-asbury-park-sandy-tour   a song's tour counts (batch 2:
                                  bb-song-tours; batch 1 had it stay bb-page)
  awards-ama                      a fragment of stats:awards with a table of
                                  its own: stays bb-page (vzell's answer 8)
  for-collectors                  a hub: its items link other stats pages, the
                                  wiki's navigation; stays bb-page
  57-channels-and-nothin-on-tour  tour counts with notes (Excl./Incl. …) and the
                                  box of other shows (from stats-tour/)
  ain-t-that-a-shame-tour         only the box of other shows: stays bb-page
                                  (from stats-tour/)
  born-to-run-studio-sessions     an album's sessions: Released, Additional
                                  Recordings, Version History (a table per song,
                                  takes, dates, titles without a take), the
                                  Timeline, Potential Album Sequences
  darkness-on-the-edge-of-town-studio-sessions-timeline
                                  a part: the Timeline alone, cells listing
                                  several takes (not split)
  born-to-run-studio-sessions-overview
                                  a part with no table: not bb-sessions
  devils-and-dust-studio-sessions-details
                                  a part: Version History with takes and titles
                                  that name none
  discography-album               a gallery (batch 3): the cover strip in tabs,
                                  then the page's entries, one section
  discography-retail              a gallery with nine sections (Album, Video,
                                  Single, …)
  discography-single              a gallery whose entries link song pages
  discography-playlist            a discography page with the strip and lists
                                  but no entries: stays bb-stats
  discography                     the hub: its tabs include the other discography
                                  pages, entries inside a tab: stays bb-stats
  songs-registered                a text page: titles as plain list items

Written as tests/fixtures/bb-stats-<name>.html. Scripts, noscripts and
theme @imports are removed (scripts/build-bb-event-fixtures.py's
`strip()`); no wiki member is named (no `printuser`; checked here).

    python3 scripts/build-bb-stats-fixtures.py [stats_dir]
    stats_dir: debug/bb-mirror/stats (scripts/copy-bb-stats-sample.sh), or
               the mirror's own stats folder; a page marked stats-tour/ is
               read from its sibling stats-tour (scripts/copy-bb-stats-tours.sh)
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
    'stats-tour/57-channels-and-nothin-on-tour',
    'stats-tour/ain-t-that-a-shame-tour',
    'born-to-run-studio-sessions',
    'darkness-on-the-edge-of-town-studio-sessions-timeline',
    'born-to-run-studio-sessions-overview',
    'devils-and-dust-studio-sessions-details',
    'discography-album',
    'discography-retail',
    'discography-single',
    'discography-playlist',
    'discography',
    'songs-registered',
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
    for entry in PAGES:
        sub, _, name = entry.rpartition('/')
        src = os.path.join(os.path.dirname(SRC), sub, f'stats_{name}.html') if sub else os.path.join(SRC, f'stats_{name}.html')
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
