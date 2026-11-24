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

Batch 4b (2026-11-24, mirror 2026-11-23; --4b writes only these, and
tests/fixtures/bb-feed-batch4b.json: the mirror's feed 1.10 with its tag
tables and the venue and relation maps of these pages only):

  venue:bow-tie-cinemas-red-bank-nj   place: "redbank", "usa" missing (tagged "red" "bank")
  venue:aami-park-melbourne-australia place: an Australian title, the venue map's "aamipark": as expected
  relation:dan-aykroyd                name: "danaykroyd" missing (tagged "danakroyd"; "usaforafrica" no name)
  relation:donald-dunn                name: the stage name "duckdunn" from the relation map: as expected
  relation:the-max-weinberg-7         a band's name: "maxweinberg7" missing
  retail:life-death-and-dennis-hopper dates: "2025" missing, "2024" not expected
  retail:born-to-run                  "Commercially Released*:" (an asterisk): as expected
  retail:a-good-life                  two dates, the first tagged: dates as expected; "a" missing
  retail:the-concert-for-the-rock-and-roll-hall-of-fame-credit  a tab page cut at 60 characters: no check

Usage: python3 scripts/build-bb-findings-page-tags-fixtures.py [mirror_dir] [--4b]
"""
import json
import importlib.util
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
OUT = os.path.join(ROOT, 'tests', 'fixtures', 'bb-findings')
ARGS = [a for a in sys.argv[1:] if a != '--4b']
ONLY_4B = '--4b' in sys.argv[1:]
MIRROR = os.path.realpath(ARGS[0] if ARGS else os.path.expanduser('~/git/scripts/BruceParser/bb/latest'))
PAGES = [
    'venue:unknown-location-bayonne-nj', 'venue:ball-arena-denver-co', 'venue:stone-pony-asbury-park-nj',
    'venue:107-1-the-boss-studio-neptune-nj',
    'song:down-in-the-hole', 'song:we-are-the-world', 'song:dinner-at-eight', 'song:angel-eyes-2',
    'song:born-in-the-usa',
    'relation:rob-demartin', 'relation:bob-seger-the-silver-bullet-band', 'relation:steven-van-zandt',
    'relation:usa-for-africa', 'relation:usa-for-africa-2',
    'retail:tracks-ii', 'retail:rescue', 'retail:j-a-m-86', 'retail:born-to-run-credits',
]
PAGES_4B = [
    'venue:bow-tie-cinemas-red-bank-nj', 'venue:aami-park-melbourne-australia',
    'relation:dan-aykroyd', 'relation:donald-dunn', 'relation:the-max-weinberg-7',
    'retail:life-death-and-dennis-hopper', 'retail:born-to-run', 'retail:a-good-life',
    'retail:the-concert-for-the-rock-and-roll-hall-of-fame-credit',
]
FEED_4B = os.path.join(ROOT, 'tests', 'fixtures', 'bb-feed-batch4b.json')


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
    for name in (PAGES_4B if ONLY_4B else PAGES + PAGES_4B):
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
    if ONLY_4B:
        with open(os.path.join(MIRROR, 'bb-feed.json'), encoding='utf-8') as fh:
            feed = json.load(fh)
        keep = set(PAGES_4B) | {'venue:stone-pony-asbury-park-nj'}
        small = {k: feed[k] for k in ('format', 'run', 'site', 'credit', 'tagTables')}
        small.update(reports={}, pages={})
        for m in ('venueTags', 'relationTags'):
            small[m] = {k: v for k, v in feed.get(m, {}).items() if k in keep}
        with open(FEED_4B, 'w', encoding='utf-8') as fh:
            json.dump(small, fh, ensure_ascii=False, indent=1)
            fh.write('\n')
        print(f'{FEED_4B}: venueTags {len(small["venueTags"])}, relationTags {len(small["relationTags"])}')


if __name__ == '__main__':
    main()
