#!/usr/bin/env python3
"""Build the fixtures of tests/fixtures/bb-findings-help-icon.spec.js from the
BruceParser mirror (org/bbp-parity.org, the help-icon check: a show the wiki
marks with the Help Us or the Featured icon carries the tag "help" or
"featured", a show with neither icon does not).

  tests/fixtures/bb-year-1968-findings.html
      the 1968 year page with three of its entries, the rest cut at its <hr />
      (scripts/build-bb-findings-batch1-fixtures.py, with another year and
      other entries); all three have the Help Us icon, one the star
  tests/fixtures/bb-findings/gig_1968-….html
      those entries' own pages, whole:
      1968-03-10 Hullabaloo           tagged "help": as expected
      1968-05-00a Off Broad Street    no "help" tag: missing
      1968-06-22a Off Broad Street    tagged "help" and "featured"; its star
                                      icon has NO title on the year page (12
                                      such entries): as expected all the same
  tests/fixtures/bb-year-1966-icons.html
      the 1966 year page with one entry, 1966-07-25 Unknown Location, Asbury
      Park: no Help Us icon, but its page is tagged "help": not expected
  tests/fixtures/bb-findings/gig_1966-07-25-unknown-location-asbury-park-nj.html
      that entry's page, whole
  tests/fixtures/bb-findings/onstage_1968-….html
      the On stage pages the wiki has of them (three; 1968-05-00a has none)
  tests/fixtures/bb-year-list-1968.html
      1968's listing, whole: its rows get their icons from the year page

What scripts/probe-bb-batch3-findings.py found on them (mirror 2026-11-15).
Scripts, noscripts and theme @imports are removed
(scripts/build-bb-event-fixtures.py's `strip()`); nothing else changes.

Usage: python3 scripts/build-bb-findings-help-icon-fixtures.py [mirror_dir]
"""
import importlib.util
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
OUT = os.path.join(ROOT, 'tests', 'fixtures')
MIRROR = os.path.realpath(sys.argv[1] if len(sys.argv) > 1 else '/home/vzell/git/scripts/BruceParser/bb/latest')
YEAR = '1968'
KEEP = [
    'gig:1968-03-10-hullabaloo-freehold-nj',
    'gig:1968-05-00a-off-broad-street-coffee-house-red-bank-nj',
    'gig:1968-06-22a-off-broad-street-coffee-house-red-bank-nj',
]
# (mirror file, fixture file): whole pages.
WHOLE = [
    ('onstage/onstage_1968-03-10-hullabaloo-freehold-nj.html', 'bb-findings/onstage_1968-03-10-hullabaloo-freehold-nj.html'),
    ('onstage/onstage_1968-06-22a-off-broad-street-coffee-house-red-bank-n.html',
     'bb-findings/onstage_1968-06-22a-off-broad-street-coffee-house-red-bank-n.html'),
    ('onstage/onstage_1966-07-25-unknown-location-asbury-park-nj.html', 'bb-findings/onstage_1966-07-25-unknown-location-asbury-park-nj.html'),
    ('1968-list.html', 'bb-year-list-1968.html'),
]


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
    mod.note = lambda what: (f'<!-- Built by scripts/build-bb-findings-help-icon-fixtures.py from the BruceParser mirror '
                             f'({os.path.basename(MIRROR)}); {what}; do not edit by hand. -->\n')
    return mod


def main():
    """Write the fixtures."""
    mod = batch1()
    mod.main()
    # 1966 with one entry, under a name of its own: bb-year-1966.html is batch
    # 2's whole page, and batch 1's builder writes bb-year-<year>-findings.html.
    mod.YEAR = '1966'
    mod.KEEP = ['gig:1966-07-25-unknown-location-asbury-park-nj']
    mod.main()
    os.replace(os.path.join(OUT, 'bb-year-1966-findings.html'), os.path.join(OUT, 'bb-year-1966-icons.html'))
    print('renamed to tests/fixtures/bb-year-1966-icons.html')
    strip = mod._strip()
    for src, dst in WHOLE:
        path = os.path.join(MIRROR, src)
        if not os.path.exists(path):
            sys.exit(f'{path} not on this machine')
        with open(path, encoding='utf-8', errors='replace') as fh:
            page = mod.with_note(strip(fh.read()), 'the whole page, scripts, noscripts and theme @imports removed')
        target = os.path.join(OUT, dst)
        with open(target, 'w', encoding='utf-8', newline='\n') as fh:
            fh.write(page)
        print(f'wrote {os.path.relpath(target, ROOT)} ({len(page)} bytes)')
    return 0


if __name__ == '__main__':
    sys.exit(main())
