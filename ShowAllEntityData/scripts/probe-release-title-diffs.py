#!/usr/bin/env python3
"""Probe: a release's tracks whose name differs from their recording's, by kind.

For the title-difference classes' browser check (feat/title-style WIP.2,
2026-11-23): asks /ws/2/release/<id>?inc=recordings once per release and lists
each track whose title differs from its recording's, with the kind
_titleDiffClass() gives (case / punct / near <= 2 edits / other), using the
same fold: lower case, "&" as "and", non-letters as spaces, accents kept (NFC).

Usage: python3 scripts/probe-release-title-diffs.py RELEASE_MBID ...
"""
import json
import re
import sys
import time
import unicodedata
import urllib.request

UA = 'SAED-probe/1.0 (userscript development probe)'


def fold(s):
    """_titleDiffFold(): lower case, & as and, non-letters/digits as one space."""
    s = unicodedata.normalize('NFC', s).lower().replace('&', ' and ')
    return re.sub(r'[\W_]+', ' ', s).strip()


def lev(a, b):
    """Levenshtein distance in code points."""
    prev = list(range(len(b) + 1))
    for i in range(1, len(a) + 1):
        cur = [i]
        for j in range(1, len(b) + 1):
            cur.append(min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] != b[j - 1])))
        prev = cur
    return prev[-1]


def kind(t, r):
    """_titleDiffClass()."""
    if t == r:
        return None
    if t.lower() == r.lower():
        return 'case'
    x, y = fold(t), fold(r)
    if x == y:
        return 'punct'
    return 'near' if lev(x, y) <= 2 else 'other'


def main(ids):
    for rid in ids:
        url = f'https://musicbrainz.org/ws/2/release/{rid}?inc=recordings&fmt=json'
        with urllib.request.urlopen(urllib.request.Request(url, headers={'User-Agent': UA}), timeout=30) as r:
            d = json.load(r)
        time.sleep(1.1)
        print(f"{d.get('title')} — https://musicbrainz.org/release/{rid}")
        counts = {}
        for m in d.get('media', []):
            for t in m.get('tracks', []):
                k = kind(t.get('title', ''), (t.get('recording') or {}).get('title', ''))
                if k:
                    counts[k] = counts.get(k, 0) + 1
                    print(f"  {m.get('position')}.{t.get('number')}  {k:<5}  {t['title']!r} ≠ {t['recording']['title']!r}")
        print('  counts:', counts)


if __name__ == '__main__':
    main(sys.argv[1:])
