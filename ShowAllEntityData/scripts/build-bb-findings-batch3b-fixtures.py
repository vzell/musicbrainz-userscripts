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
      The place family (scripts/probe-bb-place-tags.py; city, state,
      country, expectedRegions, placeTags):
      gig 2022-04-24 Washington, DC   usa missing
      gig 1984-07-23 Toronto, ON      canada missing
      gig 2013-05-11 Solna, Sweden    europe missing
      interview 2025-04-28 "Los Angels", CA   losangels missing (the typo)
      nogig 2003-09-17 Hartford, CT   usa missing (no cast tab; and tour_rsng)
      gig 1981-04-09 West Berlin, West Germany   nothing (placeTags)
      gig 2024-06-27 Nijmegen, The Netherlands   nothing ("netherlands")
      gig 1969-05-28a Wanamassa, NJ (First)      nothing (the "(First)" cut)
      gig 1985-03-21 Sydney, New South Wales, Australia   nothing
  tests/fixtures/bb-feed-2026-11-19.json
      the feed of the run of 2026-11-19 (BruceParser 0.22.1, feed 1.4.1),
      whose tagTables are the tables the probes used.

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
    # The place family (scripts/probe-bb-place-tags.py, mirror 2026-11-19).
    'gig:2022-04-24-kennedy-center-concert-hall-washington-dc',
    'gig:1984-07-23-cne-grandstand-toronto-on',
    'gig:2013-05-11-friends-arena-solna-sweden',
    'gig:1981-04-09-icc-berlin-germany',
    'gig:2024-06-27-goffertpark-nijmegen-netherlands',
    'gig:1969-05-28a-pandemonium-wanamassa-nj',
    'gig:1985-03-21-entertainment-centre-sydney-australia',
    'interview:2025-04-28-saban-media-center-los-angels-ca',
    'nogig:2003-09-17-mark-twain-house-hartford-ct',
    # The content family (scripts/probe-bb-content-tags.py, mirror 2026-11-19).
    'gig:1978-07-19-ellis-auditorium-memphis-tn',
    'gig:1974-10-19-memorial-chapel-concert-hall-schenectady-ny',
    'gig:2005-04-04-joan-and-robert-rechnitz-theater-red-bank-nj',
    'gig:1980-12-31-nassau-coliseum-uniondale-ny',
    'onstage:1980-12-31-nassau-coliseum-uniondale-ny',
    'gig:1974-12-14a-auditorium-new-brunswick-nj',
    'gig:1982-10-03-stone-pony-asbury-park-nj',
    'gig:1976-04-07-allen-theatre-cleveland-oh',
    'gig:1971-05-14-sunshine-in-asbury-park-nj',
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
