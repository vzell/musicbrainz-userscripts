#!/usr/bin/env python3
"""Build the fixtures of tests/fixtures/bb-findings-batch3.spec.js from the
BruceParser mirror (org/bbp-parity.org, Track A batch 3: a show's expected
tags against its actual tags).

  tests/fixtures/bb-year-2016-findings.html
      the 2016 year page with four of its entries, the rest cut at its <hr />
      (scripts/build-bb-findings-batch1-fixtures.py, with another year and
      other entries)
  tests/fixtures/bb-findings/<kind>_2016-….html
      those entries' own pages, whole:
      gig 2016-01-16 Pittsburgh   35 songs in bold, "prem" and no "9+": missing;
                                  508 characters of tags, so its "-2" is asked
      gig 2016-01-19 Chicago      6 songs in bold and the tag "6": as expected
      gig 2016-05-21 Madrid       3 songs in bold, the tag "2": "3" missing,
                                  "2" not expected
      interview 2016-09-06        also tagged "nogig": not expected; no cast
                                  tab, so no other page is asked
  tests/fixtures/bb-findings/onstage_2016-….html
      the three gigs' On stage pages, whole: their cast tags

What scripts/probe-bb-batch3-findings.py found on them (mirror 2026-11-15).
Scripts, noscripts and theme @imports are removed
(scripts/build-bb-event-fixtures.py's `strip()`); nothing else changes.

Usage: python3 scripts/build-bb-findings-batch3-fixtures.py [mirror_dir]
"""
import importlib.util
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
OUT = os.path.join(ROOT, 'tests', 'fixtures')
MIRROR = os.path.realpath(sys.argv[1] if len(sys.argv) > 1 else '/home/vzell/git/scripts/BruceParser/bb/latest')
YEAR = '2016'
KEEP = [
    'gig:2016-01-16-consol-energy-center-pittsburgh-pa',
    'gig:2016-01-19-united-center-chicago-il',
    'gig:2016-05-21-estadio-santiago-bernabeu-madrid-spain',
    'interview:2016-09-06-stone-hill-studio-colts-neck-nj',
]
ONSTAGE = [k.split(':', 1)[1] for k in KEEP if k.startswith('gig:')]


def batch1():
    """Batch 1's builder as a module, pointed at this mirror, year and entries."""
    spec = importlib.util.spec_from_file_location('batch1_fixtures', os.path.join(HERE, 'build-bb-findings-batch1-fixtures.py'))
    mod = importlib.util.module_from_spec(spec)
    saved = sys.argv
    sys.argv = [saved[0], MIRROR]
    try:
        spec.loader.exec_module(mod)
    finally:
        sys.argv = saved
    mod.YEAR = YEAR
    mod.KEEP = KEEP
    mod.note = lambda what: (f'<!-- Built by scripts/build-bb-findings-batch3-fixtures.py from the BruceParser mirror '
                             f'({os.path.basename(MIRROR)}); {what}; do not edit by hand. -->\n')
    return mod


def main():
    """Write the fixtures."""
    mod = batch1()
    mod.main()
    strip = mod._strip()
    for slug in ONSTAGE:
        path = os.path.join(MIRROR, 'onstage', f'onstage_{slug}.html')
        if not os.path.exists(path):
            sys.exit(f'{path} not on this machine')
        with open(path, encoding='utf-8', errors='replace') as fh:
            page = mod.with_note(strip(fh.read()), 'the whole page, scripts, noscripts and theme @imports removed')
        target = os.path.join(OUT, 'bb-findings', f'onstage_{slug}.html')
        with open(target, 'w', encoding='utf-8', newline='\n') as fh:
            fh.write(page)
        print(f'wrote {os.path.relpath(target, ROOT)} ({len(page)} bytes)')
    return 0


if __name__ == '__main__':
    sys.exit(main())
