#!/usr/bin/env python3
"""Resync ShowAllEntityData_HELP.md with the non-MB defaults flipped on 2026-10-26.

Every replacement must match exactly once; nothing is written otherwise.

Usage: python3 scripts/reword-nonmb-default-help.py
"""
import sys
from pathlib import Path

HELP = Path(__file__).resolve().parent.parent / 'ShowAllEntityData_HELP.md'

SITE_OFF = '**off until you switch it on**'
SITE_ON = '**on unless you switch it off**'

PAIRS = [
    ('Not a MusicBrainz page at all, and ' + SITE_OFF + ': ⚙️ Settings →\n'
     '*🎸 springsteenlyrics.com* → *Enable on springsteenlyrics.com collection and\n'
     'bootleg lists*. Settings are shared, so you can switch it on from',
     'Not a MusicBrainz page at all, and ' + SITE_ON + ': ⚙️ Settings →\n'
     '*🎸 springsteenlyrics.com* → *Enable on springsteenlyrics.com collection and\n'
     'bootleg lists*. Settings are shared, so you can switch it off or on from'),
    ('Not a MusicBrainz page either, and ' + SITE_OFF + ': ⚙️ Settings\n'
     '→ *🌴 jungleland.it* → *Enable on the jungleland.it bootleg artwork list*.\n'
     'Settings are shared, so you can switch it on from',
     'Not a MusicBrainz page either, and ' + SITE_ON + ': ⚙️ Settings\n'
     '→ *🌴 jungleland.it* → *Enable on the jungleland.it bootleg artwork list*.\n'
     'Settings are shared, so you can switch it off or on from'),
    ('Not a MusicBrainz page either, and ' + SITE_OFF + ': ⚙️ Settings\n'
     '→ *💿 brucespringsteen.it* → *Enable on the brucespringsteen.it record\n'
     'database*. Settings are shared, so you can switch it on from',
     'Not a MusicBrainz page either, and ' + SITE_ON + ': ⚙️ Settings\n'
     '→ *💿 brucespringsteen.it* → *Enable on the brucespringsteen.it record\n'
     'database*. Settings are shared, so you can switch it off or on from'),
    ('Not a MusicBrainz page either, and ' + SITE_OFF + ': ⚙️ Settings\n'
     '→ *📚 Brucebase* → *Enable on the Brucebase song list*. Settings are shared,\n'
     'so you can switch it on from',
     'Not a MusicBrainz page either, and ' + SITE_ON + ': ⚙️ Settings\n'
     '→ *📚 Brucebase* → *Enable on the Brucebase song list*. Settings are shared,\n'
     'so you can switch it off or on from'),
    ('before. These pages have a switch of their own, **off until you switch it\n'
     'on**:',
     'before. These pages have a switch of their own, **on unless you switch it\n'
     'off**:'),
    ("With ⚙️ Settings → *💿 Discogs* → *Enable on discogs.com* on (off by\n"
     "default),",
     "With ⚙️ Settings → *💿 Discogs* → *Enable on discogs.com* on (on by\n"
     "default),"),
    ('It is ' + SITE_OFF + ', for each site separately, right under',
     'It is ' + SITE_ON + ', for each site separately, right under'),
    ('*In the window, read a link ahead while the pointer rests on it* (same\n'
     '    section, off by default)',
     '*In the window, read a link ahead while the pointer rests on it* (same\n'
     '    section, on by default)'),
    ('**A compact category and filter bar** (off by default):',
     '**A compact category and filter bar** (on by default):'),
    ('lists (off by default); see', 'lists (on by default); see'),
    ('bootleg artwork list (off by default); see', 'bootleg artwork list (on by default); see'),
    ('record database (off by default); see', 'record database (on by default); see'),
    ('its year pages (all off by default); see', 'its year pages (all on by default); see'),
    ('submissions, user and ratings pages (off by default),',
     'submissions, user and ratings pages (on by default),'),
]


def main():
    """Apply every pair, or exit without writing when one does not match once."""
    text = HELP.read_text(encoding='utf-8')
    for old, new in PAIRS:
        n = text.count(old)
        if n != 1:
            sys.exit(f'expected 1 match, got {n}: {old[:70]!r}')
        text = text.replace(old, new)
    HELP.write_text(text, encoding='utf-8')
    print(f'reworded {len(PAIRS)} passages')


if __name__ == '__main__':
    main()
