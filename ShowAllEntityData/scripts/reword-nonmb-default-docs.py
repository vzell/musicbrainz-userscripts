#!/usr/bin/env python3
"""Resync CLAUDE.md and docs/claude/settings-and-config.md with the 2026-10-26 defaults.

Every replacement must match exactly once per file; nothing is written otherwise.

Usage: python3 scripts/reword-nonmb-default-docs.py
"""
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

SIX = ('the six foreign-site feature keys (`sa_sl_detail_preview`,\n'
       '  `sa_jl_detail_preview`, `sa_bs_detail_preview`, `sa_bb_detail_preview`,\n'
       '  `sa_sl_compact_nav`, `sa_dp_window_read_ahead`; default on since 2026-10-26)')

EDITS = {
    'CLAUDE.md': [
        ("- **Opt-in, off by default.** Each site gets its own `sa_enable_<site>`\n"
         "  checkbox with `default: false`. Its gate exits before anything visible\n"
         "  happens on that host,",
         "- **Its own switch, on by default.** Each site gets its own\n"
         "  `sa_enable_<site>` checkbox. Until 2026-10-26 it was `default: false`;\n"
         "  since then every non-MB site setting defaults to `true` except\n"
         "  `sa_bb_sidebar_right` and the `… on touch devices` ones (vzell), so a\n"
         "  new site's switch starts `true` too. Its gate exits before anything\n"
         "  visible happens on that host when it is off,"),
        ("- A fixture profile is not pristine (`FIXTURE_SETTINGS_OVERRIDE` forces eleven\n"
         "  settings off;",
         "- A fixture profile is not pristine (`FIXTURE_SETTINGS_OVERRIDE` forces\n"
         "  seventeen settings off;"),
        ("  `sa_async_pop_auto_open` and `sa_bb_mb_event_lookup` OFF\n",
         "  `sa_async_pop_auto_open`, `sa_bb_mb_event_lookup` and\n  " + SIX + " OFF\n"),
    ],
    'docs/claude/settings-and-config.md': [
        ("`sa_async_pop_auto_open` OFF, and all ten DEFAULT to true, so any\n"
         "test that counts \"changed\" settings is off by ten unless it puts them back —",
         "`sa_async_pop_auto_open`, then `sa_bb_mb_event_lookup` and, since\n"
         "2026-10-26, the six foreign-site feature keys (`sa_sl_detail_preview`,\n"
         "`sa_jl_detail_preview`, `sa_bs_detail_preview`, `sa_bb_detail_preview`,\n"
         "`sa_sl_compact_nav`, `sa_dp_window_read_ahead`) OFF, and all seventeen\n"
         "DEFAULT to true, so any test that counts \"changed\" settings is off by\n"
         "seventeen unless it puts them back —"),
    ],
}


def main():
    """Apply every edit, or exit without writing when one does not match once."""
    out = {}
    for rel, pairs in EDITS.items():
        text = (ROOT / rel).read_text(encoding='utf-8')
        for old, new in pairs:
            n = text.count(old)
            if n != 1:
                sys.exit(f'{rel}: expected 1 match, got {n}: {old[:70]!r}')
            text = text.replace(old, new)
        out[rel] = text
    for rel, text in out.items():
        (ROOT / rel).write_text(text, encoding='utf-8')
    print('ok')


if __name__ == '__main__':
    main()
