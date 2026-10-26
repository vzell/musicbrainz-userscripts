#!/usr/bin/env python3
"""Reword the code comments that still call the flipped non-MB settings "default off".

Companion of scripts/flip-nonmb-defaults.py (2026-10-26). Each replacement must
match exactly once; the script fails otherwise and writes nothing.

Usage: python3 scripts/reword-nonmb-default-comments.py
"""
import sys
from pathlib import Path

SCRIPT = Path(__file__).resolve().parent.parent / 'ShowAllEntityData.user.js'

PAIRS = [
    ("    // springsteenlyrics.com support is opt-in (`sa_enable_springsteenlyrics`,\n"
     "    // default off), so a published MusicBrainz script never changes another\n"
     "    // site's pages by surprise. Leave BEFORE anything visible",
     "    // springsteenlyrics.com support has its own switch (`sa_enable_springsteenlyrics`,\n"
     "    // default on since 2026-10-26), so a user can keep the script off another\n"
     "    // site's pages. Leave BEFORE anything visible"),
    ("    // jungleland.it support is opt-in the same way (`sa_enable_jungleland`,\n"
     "    // default off), and gated",
     "    // jungleland.it support has a switch the same way (`sa_enable_jungleland`,\n"
     "    // default on), and gated"),
    ("    // brucespringsteen.it: opt-in (`sa_enable_brucespringsteen`, default off)",
     "    // brucespringsteen.it: own switch (`sa_enable_brucespringsteen`, default on)"),
    ("    // Brucebase: opt-in (`sa_enable_brucebase`, default off), gated as early",
     "    // Brucebase: own switch (`sa_enable_brucebase`, default on), gated as early"),
    ("    // Its year pages have a switch of their own (`sa_bb_year_pages`, default\n"
     "    // off) on top of that one",
     "    // Its year pages have a switch of their own (`sa_bb_year_pages`, default\n"
     "    // on) on top of that one"),
    ("    // discogs.com: opt-in (`sa_enable_discogs`, default off), gated as early",
     "    // discogs.com: own switch (`sa_enable_discogs`, default on), gated as early"),
    ("    // `sa_bs_detail_preview`, `sa_bb_detail_preview`), default off, and",
     "    // `sa_bs_detail_preview`, `sa_bb_detail_preview`), default on, and"),
    ("     * so the click shows it at once (`sa_dp_window_read_ahead`, off by\n"
     "     * default).",
     "     * so the click shows it at once (`sa_dp_window_read_ahead`, on by\n"
     "     * default since 2026-10-26)."),
]


def main():
    """Apply every pair, or exit without writing when one does not match once."""
    text = SCRIPT.read_text(encoding='utf-8')
    for old, new in PAIRS:
        n = text.count(old)
        if n != 1:
            sys.exit(f'expected 1 match, got {n}: {old[:60]!r}')
        text = text.replace(old, new)
    SCRIPT.write_text(text, encoding='utf-8')
    print(f'reworded {len(PAIRS)} comments')


if __name__ == '__main__':
    main()
