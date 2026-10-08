"""Lists every relation attribute name (and its id) found in the captured
Web Service fixtures, with how often it occurs: which of them are
instruments, which vocals, which generic ("guest", "additional", …).

Used for org/event-GPE.org item 4 (instrument attributes as links).

usage: python3 scripts/scan-relation-attributes.py [fixture-dir]
"""
import glob
import json
import os
import sys


def walk(node, out):
    """Collects attribute-ids from every relation found anywhere in `node`."""
    if isinstance(node, dict):
        ids = node.get('attribute-ids')
        if isinstance(ids, dict):
            for name, aid in ids.items():
                key = (name, aid, node.get('type'))
                out[key] = out.get(key, 0) + 1
        for v in node.values():
            walk(v, out)
    elif isinstance(node, list):
        for v in node:
            walk(v, out)


def main():
    """Scans the fixture directory and prints one line per attribute."""
    d = sys.argv[1] if len(sys.argv) > 1 else 'tests/fixtures'
    out = {}
    for path in glob.glob(os.path.join(d, 'ws2-*.json')):
        try:
            with open(path, encoding='utf-8') as f:
                walk(json.load(f), out)
        except ValueError:
            continue
    for (name, aid, rtype), n in sorted(out.items(), key=lambda kv: (kv[0][0], kv[0][2] or '')):
        print(f'{n:5}  {name:<32} {aid}  ({rtype})')


if __name__ == '__main__':
    main()
