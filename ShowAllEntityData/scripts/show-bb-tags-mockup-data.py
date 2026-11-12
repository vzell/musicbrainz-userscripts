#!/usr/bin/env python3
"""Prints a summary of debug/bb-tags-mockup-data.json (written by
scripts/fetch-bb-tags-mockup-data.py): the cloud's weight histogram, the
weight → pages fit (weight = 100 + 200 · pages / max), and the kinds of
pages on storyteller's list.

    python3 scripts/show-bb-tags-mockup-data.py
"""

import collections
import json
import os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def main():
    """Prints the summary."""
    with open(os.path.join(ROOT, 'debug', 'bb-tags-mockup-data.json'), encoding='utf-8') as f:
        d = json.load(f)
    sizes = d['cloud']['sizes']
    print('weights: ' + ', '.join(f'{int(s)}%×{n}' for s, n in sizes))
    mx = max(t['pages'] for t in d['totals'] if t['pages'])
    for t in d['totals']:
        est = round((t['weight'] - 100) / 200 * mx)
        print(f"  {t['tag']:16} {t['weight']:5}%  pages {t['pages']:6}  estimate {est:6}  ({t['family']})")
    kinds = collections.Counter(h.lstrip('/').split(':')[0] for h, _ in d['storyteller_tagged'])
    print(f"storyteller (first {len(d['storyteller_tagged'])} of {d['storyteller_tagged_n']}): {kinds.most_common()}")
    print('top 30: ' + ', '.join(f"{t['tag']}({int(t['weight'])},{t['family']})" for t in d['cloud']['top'][:30]))


if __name__ == '__main__':
    main()
