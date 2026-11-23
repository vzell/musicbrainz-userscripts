#!/usr/bin/env python3
"""Rewrite the "Size / lines" cells of org/majkinetor.org's Inventory table from the clone.

Reads every script's .user.js in debug/majkinetor/ (bytes and lines, like `wc -c -l`) and replaces the
size cell of its Inventory row in place, padded to the cell's old width so vzell's hand alignment is kept.
A row whose new text is wider than its cell is reported and left alone (widen the column by hand).

Usage:
    python3 scripts/refresh-majkinetor-sizes.py          # dry run: print old -> new per row
    python3 scripts/refresh-majkinetor-sizes.py --apply  # write org/majkinetor.org
"""
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
ORG = os.path.join(ROOT, 'org', 'majkinetor.org')
CLONE = os.path.join(ROOT, 'debug', 'majkinetor', 'userscripts')

# Inventory row name -> (path under userscripts/, style): 'mb' = "1.88 MB / 18,051", 'kb' = "126 KB / 1,624",
# 'dist' = "dist 14,532" (lines only)
ROWS = {
    'String Theory': ('string_theory/string_theory.user.js', 'mb'),
    'Event Horizon': ('event_horizon/event_horizon.user.js', 'mb'),
    'Apollo Editor': ('apollo_editor/apollo_editor.user.js', 'mb'),
    'First Contact': ('first_contact/first_contact.user.js', 'mb'),
    'Falcon': ('falcon/falcon.user.js', 'mb'),
    'Credit Hoarder': ('credit_hoarder/dist/credit_hoarder.user.js', 'dist'),
    'Group Therapy': ('group_therapy/group_therapy.user.js', 'mb'),
    'Fusion': ('fusion/fusion.user.js', 'mb'),
    'Mission Control': ('mission_control/mission_control.user.js', 'mb'),
    'Platform Check': ('platform_check/platform_check.user.js', 'mb'),
    'ISRC Scout': ('isrc_scout/isrc_scout.user.js', 'mb'),
    'Art Station': ('art_station/art_station.user.js', 'mb'),
    'Mammoth': ('mammoth/mammoth.user.js', 'mb'),
    'Fuzzy Logic': ('fuzzy_logic/fuzzy_logic.user.js', 'mb'),
    'Scribe': ('scribe/scribe.user.js', 'kb'),
    'Bandcamp Player Enhanced': ('bandcamp_player_enhanced/bandcamp_player_enhanced.user.js', 'kb'),
}


def measure(rel):
    """Return (bytes, lines) of a clone file, as `wc -c -l` counts them."""
    with open(os.path.join(CLONE, rel), 'rb') as fh:
        data = fh.read()
    return len(data), data.count(b'\n')


def cell(rel, style):
    """Return the size cell text for one script in the table's own style."""
    size, lines = measure(rel)
    if style == 'dist':
        return f'dist {lines:,}'
    if style == 'kb':
        return f'{round(size / 1000)} KB / {lines:,}'
    return f'{size / 1e6:.2f} MB / {lines:,}'


def main():
    """Dry-run or apply the size cells."""
    apply = '--apply' in sys.argv
    with open(ORG, encoding='utf-8') as fh:
        lines = fh.read().split('\n')
    changed = 0
    for i, line in enumerate(lines):
        m = re.match(r'^\| (.+?) +\| (.+?) +\|', line)
        if not m or m.group(1) not in ROWS:
            continue
        name = m.group(1)
        rel, style = ROWS[name]
        start = line.index('|', 1) + 2
        end = line.index('|', start)
        width = end - start - 1
        old = line[start:end].rstrip()
        new = cell(rel, style)
        if len(new) > width:
            print(f'TOO WIDE {name}: {new!r} > {width}')
            continue
        if new != old:
            print(f'{name:26} {old:18} -> {new}')
            lines[i] = line[:start] + new.ljust(width) + ' ' + line[end:]
            changed += 1
    if apply and changed:
        with open(ORG, 'w', encoding='utf-8') as fh:
            fh.write('\n'.join(lines))
    print(f'{changed} cell(s) {"written" if apply else "would change"}')


if __name__ == '__main__':
    main()
