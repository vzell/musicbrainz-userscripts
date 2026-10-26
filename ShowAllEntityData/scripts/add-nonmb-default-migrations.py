#!/usr/bin/env python3
"""Add `_SETTINGS_MIGRATIONS` rows for the non-MB defaults flipped on 2026-10-26.

Inserts `{ key: '<k>', was: [false] }` for each key in alphabetical position
inside the `_SETTINGS_MIGRATIONS` array, padding the key column the way the
existing rows do. Idempotent: a key already listed is left alone.

Usage: python3 scripts/add-nonmb-default-migrations.py
"""
import re
import sys
from pathlib import Path

SCRIPT = Path(__file__).resolve().parent.parent / 'ShowAllEntityData.user.js'

KEYS = [
    'sa_bb_detail_preview', 'sa_bb_year_pages', 'sa_bs_detail_preview',
    'sa_dp_window_read_ahead', 'sa_enable_brucebase', 'sa_enable_brucespringsteen',
    'sa_enable_discogs', 'sa_enable_jungleland', 'sa_enable_springsteenlyrics',
    'sa_jl_detail_preview', 'sa_sl_compact_nav', 'sa_sl_detail_preview',
]

ROW_RE = re.compile(r"^        \{ key: '([a-z0-9_]+)',")


def row(key):
    """Format one migration row.

    @param {str} key - the settings key
    @returns {str} the source line
    """
    head = f"{{ key: '{key}',"
    return '        ' + head.ljust(43) + 'was: [false] },'


def main():
    """Insert the missing rows in sorted position."""
    text = SCRIPT.read_text(encoding='utf-8')
    start = text.index('    const _SETTINGS_MIGRATIONS = [\n')
    end = text.index('\n    ];', start)
    lines = text[start:end].split('\n')
    have = {m.group(1) for m in (ROW_RE.match(l) for l in lines) if m}
    for key in KEYS:
        if key in have:
            continue
        # Insert before the first row whose key sorts after this one.
        pos = len(lines)
        for i, l in enumerate(lines):
            m = ROW_RE.match(l)
            if m and m.group(1) > key:
                pos = i
                # Keep a comment block directly above that row attached to it.
                while pos > 0 and lines[pos - 1].lstrip().startswith('//'):
                    pos -= 1
                break
        lines.insert(pos, row(key))
    if not lines:
        sys.exit('no migrations array')
    text = text[:start] + '\n'.join(lines) + text[end:]
    SCRIPT.write_text(text, encoding='utf-8')
    print('ok')


if __name__ == '__main__':
    main()
