"""Read-only check that every `find` of every mutation list still matches its
target exactly once — the precondition scripts/mutation-check.py enforces at
run time, checked here without running a single spec.

A change that edits a line some mutation anchors on (a renamed variable, an
added argument) silently breaks that list until someone runs it; this finds it
at once. Exit 1 when any anchor matches zero times or more than once.

usage: python3 scripts/check-mutation-anchors.py [scripts/mutations/<list>.json ...]
"""
import glob
import json
import os
import sys

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
DEFAULT_TARGET = 'ShowAllEntityData.user.js'


def main():
    """Check the named lists (every list by default); print each bad anchor."""
    lists = sys.argv[1:] or sorted(glob.glob(os.path.join(ROOT, 'scripts', 'mutations', '*.json')))
    texts = {}
    bad = 0
    total = 0
    for lst in lists:
        with open(lst, encoding='utf-8') as f:
            muts = json.load(f)
        for m in muts:
            target = m.get('file', DEFAULT_TARGET)
            path = os.path.normpath(os.path.join(ROOT, target))
            if path not in texts:
                try:
                    with open(path, encoding='utf-8') as f:
                        texts[path] = f.read()
                except FileNotFoundError:
                    texts[path] = None
            if texts[path] is None:
                bad += 1
                print(f'{os.path.relpath(lst, ROOT)}: "{m["name"]}": target {target} not found')
                continue
            for e in m.get('edits', []):
                total += 1
                n = texts[path].count(e['find'])
                if n != 1:
                    bad += 1
                    print(f'{os.path.relpath(lst, ROOT)}: "{m["name"]}": find matches {n}x in {target}')
    print(f'{total} anchors in {len(lists)} lists, {bad} bad')
    return 1 if bad else 0


if __name__ == '__main__':
    sys.exit(main())
