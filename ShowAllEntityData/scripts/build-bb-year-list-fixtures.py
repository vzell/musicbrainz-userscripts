#!/usr/bin/env python3
"""Build the Brucebase year listing fixtures (`bb-year-list`,
org/brucebase.org Phase 9) from the BruceParser mirror.

Pages, each chosen for a shape (scripts/probe-bb-year-list.py, 2026-11-12):
  2026-list     the newest; notes, a tour start with a banner image
  1978-list     173 entries, Recording Session notes, a whole tour
  1949-64-list  the one non-year key, 00 dates, an intro and no tour
  1981-list     "End of the 1st leg, and Start of the 2nd leg of … - Europe"
  2005-list     "… era / Start of …", and an entry with a stray "]"
  1973-list     "Continuation of …" at the top

Scripts, noscripts and theme @imports are removed (scripts/build-bb-event-
fixtures.py's `strip()`); nothing else changes.

Usage: python3 scripts/build-bb-year-list-fixtures.py [mirror_dir]
"""
import importlib.util
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
OUT = os.path.join(ROOT, 'tests', 'fixtures')
MIRROR = sys.argv[1] if len(sys.argv) > 1 else '/home/vzell/git/scripts/BruceParser/bb/latest'
KEYS = ['2026', '1978', '1949-64', '1981', '2005', '1973']


def _strip():
    """scripts/build-bb-event-fixtures.py's `strip()` (a hyphenated module name)."""
    spec = importlib.util.spec_from_file_location('build_bb_event_fixtures', os.path.join(HERE, 'build-bb-event-fixtures.py'))
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod.strip


def main():
    """Write each fixture whose source page is on the machine."""
    strip = _strip()
    wrote = 0
    for key in KEYS:
        src = os.path.join(MIRROR, f'{key}-list.html')
        if not os.path.exists(src):
            print(f'skip {key}: {src} not on this machine')
            continue
        with open(src, encoding='utf-8', errors='replace') as fh:
            html = strip(fh.read())
        n = len(re.findall(r'<li><a href="/(?:\d{4}|1949-64)#\d{6}', html))
        if 'id="page-content"' not in html or n == 0:
            sys.exit(f'{src}: no #page-content or no entries')
        note = ('<!-- Built by scripts/build-bb-year-list-fixtures.py from the BruceParser mirror (2026-10-18); '
                'scripts, noscripts and theme @imports removed; do not edit by hand. -->\n')
        html = re.sub(r'(<!DOCTYPE[^>]*>\s*)', lambda m: m.group(1) + note, html, count=1, flags=re.I)
        target = os.path.join(OUT, f'bb-year-list-{key}.html')
        with open(target, 'w', encoding='utf-8', newline='\n') as fh:
            fh.write(html)
        wrote += 1
        print(f'wrote {os.path.relpath(target, ROOT)} ({len(html)} bytes, {n} entries)')
    print(f'{wrote} of {len(KEYS)} fixtures written')
    return 0


if __name__ == '__main__':
    sys.exit(main())
