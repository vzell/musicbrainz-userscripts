#!/usr/bin/env python3
"""Builds the Brucebase story page fixtures (`bb-story`, org/brucebase.org
Phase 12) from the BruceParser mirror, one page per shape the probe found
(scripts/probe-bb-story-pages.py, scripts/check-bb-story-reader.js,
2026-11-12):

  story-1978-07-07-roxy-theatre-west-hollywood-ca   a show's Storyteller words:
                                                    moments with their songs
  story-1971-05-15-union-nj                         an older name, date and
                                                    town only (the date lookup)
  interview-1978-08-25a-veterans-memorial-coliseum-new-h   bold speakers
  podcast-2021-02-22-stone-hill-farm-colts-neck-nj-ep-0     "Speaker: words"
  speech-2023-10-29-performing-arts-center-newark-nj        two captioned parts
  dj-2020-04-08-siriusxm-studio-new-york-city-ny            a DJ set: an h2 part,
                                                            plain paragraphs

Written as tests/fixtures/bb-story-<name>.html. Scripts, noscripts and
theme @imports are removed (scripts/build-bb-event-fixtures.py's
`strip()`); "Compiled by" names the page's compiler, which the page itself
shows (as tests/fixtures/bb-history-story-1978-09-15.html keeps it); no
wiki member is named (no `printuser`; checked here).

    python3 scripts/build-bb-story-fixtures.py [mirror_dir]
"""
import importlib.util
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
OUT = os.path.join(ROOT, 'tests', 'fixtures')
MIRROR = sys.argv[1] if len(sys.argv) > 1 else '/home/vzell/git/scripts/BruceParser/bb/latest'
PAGES = [
    'story-1978-07-07-roxy-theatre-west-hollywood-ca',
    'story-1971-05-15-union-nj',
    'interview-1978-08-25a-veterans-memorial-coliseum-new-h',
    'podcast-2021-02-22-stone-hill-farm-colts-neck-nj-ep-0',
    'speech-2023-10-29-performing-arts-center-newark-nj',
    'dj-2020-04-08-siriusxm-studio-new-york-city-ny',
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
        src = os.path.join(MIRROR, 'story', f'story_{name}.html')
        if not os.path.exists(src):
            print(f'skip {name}: {src} not on this machine')
            continue
        with open(src, encoding='utf-8', errors='replace') as fh:
            html = strip(fh.read())
        if 'id="page-content"' not in html:
            sys.exit(f'{src}: no #page-content')
        if 'printuser' in html:
            sys.exit(f'{src}: names a wiki member (printuser)')
        note = ('<!-- Built by scripts/build-bb-story-fixtures.py from the BruceParser mirror; scripts, noscripts and '
                'theme @imports removed; do not edit by hand. -->\n')
        html = re.sub(r'(<!DOCTYPE[^>]*>\s*)', lambda m: m.group(1) + note, html, count=1, flags=re.I)
        target = os.path.join(OUT, f'bb-story-{name}.html')
        with open(target, 'w', encoding='utf-8', newline='\n') as fh:
            fh.write(html)
        wrote += 1
        print(f'wrote {os.path.relpath(target, ROOT)} ({len(html):,} bytes)')
    print(f'{wrote} of {len(PAGES)} fixtures written')
    return 0


if __name__ == '__main__':
    sys.exit(main())
