#!/usr/bin/env python3
"""List the FINDINGS entries and whether their hover text is a diff card.

Usage:
    python3 scripts/list-findings-compare.py [--all]

Reads ShowAllEntityData.user.js, the `const FINDINGS = [` array, and prints
one line per entry (an `id:` key at the entry's top level, and the spread
`...Object.entries(X).map` families by their source map): whether it has a
`compare` (the two values under each other with the letters that differ
marked, `_cmpHtml()`) or only a `detail` (prose), and its detail text's first
line. With no --all, only entries with a detail and no compare whose detail
looks like a comparison of two strings (two quoted values, or words like
"against", "differs", "would be", "instead of").
Written 2026-11-23 (vzell: "check if other tooltips have the same defect",
after the dependent-name card was prose where the venue card is a diff).
"""
import argparse
import os
import re

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, '..', 'ShowAllEntityData.user.js')
CMP_WORDS = re.compile(r'against|differ|would be|instead of|should read|expected|is named|is titled|written', re.I)


def entries(text):
    """Split the FINDINGS array into (start line, entry text) by its top-level braces."""
    start = text.index('const FINDINGS = [')
    i = text.index('[', start) + 1
    depth, out, cur_start, quote, esc = 0, [], None, None, False
    line = text.count('\n', 0, i) + 1
    while i < len(text):
        ch = text[i]
        if ch == '\n':
            line += 1
        if quote:
            if esc:
                esc = False
            elif ch == '\\':
                esc = True
            elif ch == quote:
                quote = None
        elif ch in '\'"`':
            quote = ch
        elif ch == '/' and text[i + 1:i + 2] == '/':
            j = text.index('\n', i)
            i = j
            line += 1
            continue
        elif ch in '{([':
            if depth == 0 and ch == '{':
                cur_start = (i, line)
            depth += 1
        elif ch in '})]':
            if depth == 0 and ch == ']':
                break
            depth -= 1
            if depth == 0 and ch == '}' and cur_start:
                out.append((cur_start[1], text[cur_start[0]:i + 1]))
                cur_start = None
        i += 1
    return out


def main():
    """Print the entries."""
    ap = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    ap.add_argument('--all', action='store_true')
    args = ap.parse_args()
    with open(SRC, encoding='utf-8') as f:
        text = f.read()
    rows = []
    for line, body in entries(text):
        m = re.search(r"\bid:\s*'([^']+)'", body)
        fid = m.group(1) if m else re.search(r"\bid:\s*([\w.]+)", body).group(1)
        has_cmp = re.search(r'\bcompare\s*:', body) is not None
        dm = re.search(r'\bdetail\s*:\s*(.*)', body)
        detail = dm.group(1).strip()[:150] if dm else ''
        looks = bool(dm) and (CMP_WORDS.search(body[dm.start():dm.start() + 1500]) is not None)
        rows.append((line, fid, has_cmp, bool(dm), looks, detail))
    for line, fid, has_cmp, has_detail, looks, detail in rows:
        if not args.all and (has_cmp or not has_detail or not looks):
            continue
        print(f'{line:6}  {fid:34} compare={"yes" if has_cmp else "no ":3}  {detail}')
    print(f'{len(rows)} entries, {sum(r[2] for r in rows)} with compare, '
          f'{sum(1 for r in rows if r[3] and not r[2])} with a detail only, '
          f'{sum(1 for r in rows if r[3] and not r[2] and r[4])} of them comparing words')


if __name__ == '__main__':
    main()
