#!/usr/bin/env python3
"""Build the fixtures of tests/fixtures/bb-findings-page-tags.spec.js from the
BruceParser mirror (org/bbp-parity.org, parity batch 4: the tag checks of
venue, song, relation and release pages).

Whole pages into tests/fixtures/bb-findings/<kind>_<slug>.html; what
scripts/probe-bb-page-tags.py found on each (mirror 2026-11-15):

  venue:unknown-location-bayonne-nj   "u" missing (also in the feed: first-letter)
  venue:ball-arena-denver-co          "venue" missing
  venue:stone-pony-asbury-park-nj     as expected
  venue:107-1-the-boss-studio-neptune-nj  "0-9" missing (a digit)
  song:down-in-the-hole               the title tag missing (tagged "downinthewhole")
  song:we-are-the-world               "lyricsheet" without a lyric sheet: not expected
  song:dinner-at-eight                "d" missing
  song:angel-eyes-2                   a cover's "( - Artist - )", the tag "angeleyes2": as expected
  song:born-in-the-usa                tagged "redirect": no check
  relation:rob-demartin               "d" missing (surname DeMartin)
  relation:bob-seger-the-silver-bullet-band  a band with "&": "&", "band": as expected
  relation:steven-van-zandt           a person with a Bands tab: as expected
  relation:usa-for-africa             504 characters of tags: its "-2" keeps more
  relation:usa-for-africa-2           that "-2" (no tabs: no check of its own)
  retail:tracks-ii                    "underconstruction" without the banner: not expected
  retail:rescue                       "retail" missing
  retail:j-a-m-86                     the banner as a plain p > em, and the tag: as expected
                                      (BruceBaseParser reads only sup > em)
  retail:born-to-run-credits          a release's tab page: no check

Scripts, noscripts and theme @imports are removed
(scripts/build-bb-event-fixtures.py's `strip()`); nothing else changes.

Usage: python3 scripts/build-bb-findings-page-tags-fixtures.py [mirror_dir]
"""
import importlib.util
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
OUT = os.path.join(ROOT, 'tests', 'fixtures', 'bb-findings')
MIRROR = os.path.realpath(sys.argv[1] if len(sys.argv) > 1 else os.path.expanduser('~/git/scripts/BruceParser/bb/latest'))
PAGES = [
    'venue:unknown-location-bayonne-nj', 'venue:ball-arena-denver-co', 'venue:stone-pony-asbury-park-nj',
    'venue:107-1-the-boss-studio-neptune-nj',
    'song:down-in-the-hole', 'song:we-are-the-world', 'song:dinner-at-eight', 'song:angel-eyes-2',
    'song:born-in-the-usa',
    'relation:rob-demartin', 'relation:bob-seger-the-silver-bullet-band', 'relation:steven-van-zandt',
    'relation:usa-for-africa', 'relation:usa-for-africa-2',
    'retail:tracks-ii', 'retail:rescue', 'retail:j-a-m-86', 'retail:born-to-run-credits',
]


def _strip():
    """scripts/build-bb-event-fixtures.py's `strip()` (a hyphenated module name)."""
    spec = importlib.util.spec_from_file_location('build_bb_event_fixtures', os.path.join(HERE, 'build-bb-event-fixtures.py'))
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod.strip


def main():
    """Write the fixtures."""
    strip = _strip()
    os.makedirs(OUT, exist_ok=True)
    for name in PAGES:
        cat, slug = name.split(':', 1)
        src = os.path.join(MIRROR, cat, f'{cat}_{slug}.html')
        if not os.path.exists(src):
            sys.exit(f'{src} not on this machine')
        with open(src, encoding='utf-8') as fh:
            html = strip(fh.read())
        note = (f'<!-- Built by scripts/build-bb-findings-page-tags-fixtures.py from the BruceParser mirror '
                f'({os.path.basename(MIRROR)}); {name}, whole; do not edit by hand. -->\n')
        html = re.sub(r'(<!DOCTYPE[^>]*>\s*)', lambda m: m.group(1) + note, html, count=1, flags=re.I)
        dst = os.path.join(OUT, f'{cat}_{slug}.html')
        with open(dst, 'w', encoding='utf-8') as fh:
            fh.write(html)
        print(f'{dst}: {len(html)} bytes')


if __name__ == '__main__':
    main()
