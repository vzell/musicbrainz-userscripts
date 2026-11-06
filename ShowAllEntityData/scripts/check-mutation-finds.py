#!/usr/bin/env python3
"""Report mutation entries whose `find` no longer occurs exactly once in its target.

usage (from ShowAllEntityData/):

    python3 scripts/check-mutation-finds.py                    # every list
    python3 scripts/check-mutation-finds.py scripts/mutations/popup-mb.json ...

`scripts/mutation-check.py` refuses such an entry (ERROR) only when the list is
run, and most lists are run once, when they are written. Code moves on, so finds
go stale unseen: on 2026-11-06 160 finds in 74 lists matched nothing or more
than one place (DEBUG-NOTES.md, "160 stale mutation finds repointed"). This
check is read-only and takes about a second; run it after a refactor and before
a merge. Exit status: 1 when any find is stale, else 0.
"""

import glob
import json
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def main():
    """Count each find in its target (read once each) and print the stale ones."""
    lists = sys.argv[1:] or sorted(glob.glob(os.path.join(ROOT, 'scripts', 'mutations', '*.json')))
    texts = {}
    bad = 0
    for path in lists:
        with open(path, encoding='utf-8') as fh:
            entries = json.load(fh)
        for m in entries:
            target = os.path.normpath(os.path.join(ROOT, m.get('file', 'ShowAllEntityData.user.js')))
            if target not in texts:
                with open(target, encoding='utf-8') as fh:
                    texts[target] = fh.read()
            for i, e in enumerate(m['edits']):
                n = texts[target].count(e['find'])
                if n != 1:
                    bad += 1
                    print(f'{os.path.basename(path)}: "{m["name"]}" edit {i}: find occurs {n}x')
    print(f'{len(lists)} lists, {bad} stale find(s)')
    return 1 if bad else 0


if __name__ == '__main__':
    sys.exit(main())
