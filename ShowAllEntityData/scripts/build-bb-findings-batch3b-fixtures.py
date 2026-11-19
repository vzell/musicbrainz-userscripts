#!/usr/bin/env python3
"""Build the fixtures of tests/fixtures/bb-findings-batch3b.spec.js from the
BruceParser mirror (org/springsteen-marriage.org, Track A batch 3b: the tag
families BruceBaseParser guessed at, tuned with vzell one at a time).

  tests/fixtures/bb-findings/<kind>_….html
      whole event pages, scripts, noscripts and theme @imports removed
      (scripts/build-bb-event-fixtures.py's `strip()`). What
      scripts/probe-bb-tour-tags.py found on them (mirror 2026-11-19), the
      tour family (gigs and nogigs; tour_no excuses; all covering tours):
      gig 2023-05-04 Rathangan        in the 2023-25 International's dates,
                                      no tour tag: tour_23int missing
      nogig 2008-06-23a Brussels      in Magic's dates, tagged tour_rsng:
                                      tour_mgc missing, tour_rsng not
                                      expected (no cast tab, no other page)
      nogig 1975-03-13 Atlanta        after The Wild, The Innocent's last
                                      date, tagged tour_wiess: not expected
      gig 2016-01-22 Wellington       in The River 2016's dates, tagged
                                      tour_no: nothing
      gig 2025-05-14 Manchester       in two tours' dates, tagged with both:
                                      nothing
      rehearsal 2016-01-15 Pittsburgh tour_rvr16 the day before the tour:
                                      not looked at (a rehearsal)
      nogig 1975-10-00 Memphis        tour_btr on a date with "00": not
                                      looked at
  tests/fixtures/bb-feed-2026-11-19.json
      the feed of the run of 2026-11-19 (BruceParser 0.22.0, feed 1.4), whose
      tagTables are the tables the probe used.

Usage: python3 scripts/build-bb-findings-batch3b-fixtures.py [mirror_dir]
"""
import importlib.util
import os
import re
import shutil
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
OUT = os.path.join(ROOT, 'tests', 'fixtures')
MIRROR = os.path.realpath(sys.argv[1] if len(sys.argv) > 1 else '/home/vzell/git/scripts/BruceParser/bb/latest')
PAGES = [
    'gig:2023-05-04-burrow-rathangan-ireland',
    'nogig:2008-06-23a-koning-boudewijnstadion-brussels-belgium',
    'nogig:1975-03-13-electric-ballroom-atlanta-ga',
    'gig:2016-01-22-louisburg-farm-wellington-fl',
    'gig:2025-05-14-co-op-live-manchester-england',
    'rehearsal:2016-01-15-consol-energy-center-pittsburgh-pa',
    'nogig:1975-10-00-unknown-location-memphis-tn',
]
FEED = 'bb-feed.json'


def strip_fn():
    """scripts/build-bb-event-fixtures.py's `strip()` (a hyphenated module name)."""
    spec = importlib.util.spec_from_file_location('build_bb_event_fixtures', os.path.join(HERE, 'build-bb-event-fixtures.py'))
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod.strip


def with_note(html, what):
    """The page with a "built by" comment after its doctype."""
    note = (f'<!-- Built by scripts/build-bb-findings-batch3b-fixtures.py from the BruceParser mirror '
            f'({os.path.basename(MIRROR)}); {what}; do not edit by hand. -->\n')
    return re.sub(r'(<!DOCTYPE[^>]*>\s*)', lambda m: m.group(1) + note, html, count=1, flags=re.I)


def main():
    """Write the fixtures."""
    strip = strip_fn()
    for name in PAGES:
        kind, slug = name.split(':', 1)
        path = os.path.join(MIRROR, kind, f'{kind}_{slug}.html')
        if not os.path.exists(path):
            sys.exit(f'{path} not on this machine')
        with open(path, encoding='utf-8', errors='replace') as fh:
            page = with_note(strip(fh.read()), 'the whole page, scripts, noscripts and theme @imports removed')
        target = os.path.join(OUT, 'bb-findings', f'{kind}_{slug}.html')
        with open(target, 'w', encoding='utf-8', newline='\n') as fh:
            fh.write(page)
        print(f'wrote {os.path.relpath(target, ROOT)} ({len(page)} bytes)')
    src = os.path.join(MIRROR, FEED)
    if not os.path.exists(src):
        sys.exit(f'{src} not on this machine')
    target = os.path.join(OUT, f'bb-feed-{os.path.basename(MIRROR)}.json')
    shutil.copyfile(src, target)
    print(f'wrote {os.path.relpath(target, ROOT)} ({os.path.getsize(target)} bytes)')
    return 0


if __name__ == '__main__':
    sys.exit(main())
