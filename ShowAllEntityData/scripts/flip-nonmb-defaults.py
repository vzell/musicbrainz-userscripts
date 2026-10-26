#!/usr/bin/env python3
"""Flip the non-MusicBrainz site settings' schema defaults from false to true.

One-shot helper for the 2026-10-26 change (vzell: "make all the non-MB site
settings which are currently false default true, except the Brucebase side
bar and the touch-device ones"). It edits only the `default: false` line and a
leading "Off by default." in the description of each named key inside
`configSchema`, and fails loudly when a key is not found exactly once.

Usage: python3 scripts/flip-nonmb-defaults.py [--check]
"""
import re
import sys
from pathlib import Path

SCRIPT = Path(__file__).resolve().parent.parent / 'ShowAllEntityData.user.js'

KEYS = [
    'sa_enable_springsteenlyrics', 'sa_sl_detail_preview', 'sa_sl_compact_nav',
    'sa_enable_jungleland', 'sa_jl_detail_preview',
    'sa_enable_brucespringsteen', 'sa_bs_detail_preview',
    'sa_enable_brucebase', 'sa_bb_year_pages', 'sa_bb_detail_preview',
    'sa_enable_discogs', 'sa_dp_window_read_ahead',
]


def flip(text, key):
    """Return `text` with `key`'s schema block switched to default true.

    @param {str} text - the whole userscript
    @param {str} key - the settings key
    @returns {str} the edited text
    """
    m = re.search(r'\n        ' + re.escape(key) + r': \{\n(.*?)\n        \}', text, re.S)
    if not m:
        sys.exit(f'{key}: schema block not found')
    block = m.group(1)
    if block.count('default: false') != 1:
        sys.exit(f'{key}: expected exactly one "default: false"')
    new = block.replace('default: false', 'default: true')
    new = new.replace("description: 'Off by default. ", "description: 'On by default. ", 1)
    return text[:m.start(1)] + new + text[m.end(1):]


def main():
    """Apply (or with --check, only verify) the flips."""
    text = SCRIPT.read_text(encoding='utf-8')
    out = text
    for k in KEYS:
        out = flip(out, k)
    if '--check' in sys.argv:
        print('ok: all keys found')
        return
    SCRIPT.write_text(out, encoding='utf-8')
    print(f'flipped {len(KEYS)} defaults')


if __name__ == '__main__':
    main()
