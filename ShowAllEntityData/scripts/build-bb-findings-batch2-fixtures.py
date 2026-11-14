#!/usr/bin/env python3
"""Build the fixtures of tests/fixtures/bb-findings-batch2.spec.js from the
BruceParser mirror (org/bbp-parity.org, Track A batch 2).

The listing checks (bb-list-title, bb-list-anchor), whole pages:
  tests/fixtures/bb-year-list-1966.html, bb-year-1966.html
      1966's listing writes "BUSINESS DISTRICT" where the year page has
      "UNKNOWN LOCATION" (1966-07-25, 1966-07-26): two bb-list-title rows.
  tests/fixtures/bb-year-list-2011.html, bb-year-2011.html
      2011's listing writes "2011-02-15 - STONE HILL STUDIO" on a link to
      #000211, where the year page has 2011-02-00: bb-list-anchor (the
      anchor is not the date) and bb-list-title.

What scripts/probe-bb-batch2-findings.py found on them (2026-11-13 mirror).
Scripts, noscripts and theme @imports are removed
(scripts/build-bb-event-fixtures.py's `strip()`); nothing else changes.

Usage: python3 scripts/build-bb-findings-batch2-fixtures.py [mirror_dir]
"""
import importlib.util
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
OUT = os.path.join(ROOT, 'tests', 'fixtures')
MIRROR = os.path.realpath(sys.argv[1] if len(sys.argv) > 1 else '/home/vzell/git/scripts/BruceParser/bb/latest')
WHOLE = [
    ('1966-list.html', 'bb-year-list-1966.html'),
    ('1966.html', 'bb-year-1966.html'),
    ('2011-list.html', 'bb-year-list-2011.html'),
    ('2011.html', 'bb-year-2011.html'),
]


def _strip():
    """scripts/build-bb-event-fixtures.py's `strip()` (a hyphenated module name)."""
    spec = importlib.util.spec_from_file_location('build_bb_event_fixtures', os.path.join(HERE, 'build-bb-event-fixtures.py'))
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod.strip


def with_note(html, what):
    """The page with a "built by" comment after its doctype."""
    note = (f'<!-- Built by scripts/build-bb-findings-batch2-fixtures.py from the BruceParser mirror '
            f'({os.path.basename(MIRROR)}); {what}; do not edit by hand. -->\n')
    return re.sub(r'(<!DOCTYPE[^>]*>\s*)', lambda m: m.group(1) + note, html, count=1, flags=re.I)


def main():
    """Write the fixtures."""
    strip = _strip()
    for src, dst in WHOLE:
        path = os.path.join(MIRROR, src)
        if not os.path.exists(path):
            sys.exit(f'{path} not on this machine')
        with open(path, encoding='utf-8') as fh:
            out = with_note(strip(fh.read()), 'the whole page, scripts, noscripts and theme @imports removed')
        target = os.path.join(OUT, dst)
        with open(target, 'w', encoding='utf-8', newline='\n') as fh:
            fh.write(out)
        print(f'wrote {os.path.relpath(target, ROOT)} ({len(out)} bytes)')


if __name__ == '__main__':
    main()
