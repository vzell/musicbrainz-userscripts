#!/usr/bin/env python3
"""Batch 4b: the release pages' letter tags in detail (read-only, no network).

Usage:
    python3 scripts/analyse-bb-batch4b-letters.py ROWS.json

ROWS.json is scripts/probe-bb-page-tags.py --rows output (with its batch 4b
"cand" entries). Prints the release main pages that carry a single-letter
tag other than their title's first letter, and those that carry none, with
their other tags, so the question to vzell can show both.
"""
import json
import sys


def main():
    """Print the two lists."""
    with open(sys.argv[1], encoding='utf-8') as f:
        rows = json.load(f)
    ret = [r for r in rows if r['kind'] == 'retail' and r.get('cand')]
    wrong, none = [], []
    for r in ret:
        letters = sorted(t for t in r['tags'] if len(t) == 1 and t.isalpha() or t == '0-9')
        want = r['cand']['letter']['plain'][0]
        if not letters:
            none.append(r)
        elif want and want not in letters:
            wrong.append((r, letters, want))
    print(f'release main pages {len(ret)}; with a letter tag but not the title\'s first: {len(wrong)}; with none: {len(none)}')
    for r, letters, want in wrong:
        print(f'  {r["name"]} "{r["title"]}" has {letters}, title gives {want!r}')
    print('without any letter tag:')
    for r in none:
        print(f'  {r["name"]} "{r["title"]}" tags: {" ".join(sorted(r["tags"]))[:120]}')
    other = {'r_other', 'collaboration', 'compilation', 'variousartists'}
    print('\nby shape (a "Commercially Released" line; an other-artist tag: r_other, collaboration, compilation,'
          ' variousartists):')
    for line in (True, False):
        for oth in (False, True):
            grp = [r for r in ret if (r['cand']['date']['dates'] is not None) == line
                   and bool(other & set(r['tags'])) == oth]
            with_l = sum(1 for r in grp if any(len(t) == 1 and t.isalpha() or t == '0-9' for t in r['tags']))
            print(f'  line {line!s:5} other {oth!s:5}: {len(grp):4} pages, {with_l:4} with a letter tag')
            if line and oth:
                print('     with a letter: ' + ', '.join(r['name'].split(':', 1)[1] for r in grp
                                                     if any(len(t) == 1 and t.isalpha() or t == '0-9' for t in r['tags'])))
            if line and not oth:
                print('     without: ' + ', '.join(r['name'].split(':', 1)[1] for r in grp
                                              if not any(len(t) == 1 and t.isalpha() or t == '0-9' for t in r['tags'])))


if __name__ == '__main__':
    main()
