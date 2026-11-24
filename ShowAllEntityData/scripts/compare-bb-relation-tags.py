#!/usr/bin/env python3
"""Compare BruceParser's relation-tags.awk output with probe-bb-relation-tags.py --json (batch 4b).

Usage:
    python3 scripts/compare-bb-relation-tags.py MAP.json RELATION-TAGS.tsv

MAP.json: {page: [tag, ...]} from the probe; the TSV: "relation TAB page TAB
tag[,tag...] TAB recall" from relation-tags.awk (or a feed's relationTags,
see --feed). Prints the counts and every page whose tag set differs. Exit
code 1 when anything differs. Read-only, no network.
"""
import json
import sys


def main():
    """Load both maps and print the differences."""
    probe = json.load(open(sys.argv[1], encoding='utf-8'))
    awk = {}
    with open(sys.argv[2], encoding='utf-8') as fh:
        for line in fh:
            parts = line.rstrip('\n').split('\t')
            if len(parts) >= 3 and parts[0] == 'relation':
                awk[parts[1]] = parts[2].split(',')
    only_p = sorted(set(probe) - set(awk))
    only_a = sorted(set(awk) - set(probe))
    diff = sorted(p for p in set(probe) & set(awk) if sorted(probe[p]) != sorted(awk[p]))
    print(f'probe {len(probe)}, awk {len(awk)}, equal {len(set(probe) & set(awk)) - len(diff)}; '
          f'only probe {len(only_p)}, only awk {len(only_a)}, different {len(diff)}')
    for p in only_p:
        print(f'  only probe: {p} {probe[p]}')
    for p in only_a:
        print(f'  only awk:   {p} {awk[p]}')
    for p in diff:
        print(f'  different:  {p} probe {probe[p]} awk {awk[p]}')
    return 1 if only_p or only_a or diff else 0


if __name__ == '__main__':
    sys.exit(main())
