#!/usr/bin/env python3
"""Append mutation entries (a JSON array in a file) to a scripts/mutations/*.json list, in its own layout.

The lists are hand-laid JSON with 2-space indents; a json.load/json.dump round trip would reflow them.
This appends the new entries' text before the closing bracket instead, then checks the result parses.

Usage:
    python3 scripts/add-mutation-entries.py scripts/mutations/<list>.json <new-entries.json>
"""
import json
import sys


def main():
    """Append the entries and verify the list still parses."""
    target, extra = sys.argv[1], sys.argv[2]
    with open(extra, encoding='utf-8') as fh:
        entries = json.load(fh)
    with open(target, encoding='utf-8') as fh:
        text = fh.read()
    end = text.rstrip().rfind(']')
    if end < 0:
        sys.exit('no closing bracket in ' + target)
    body = ',\n'.join('  ' + json.dumps(e, indent=2, ensure_ascii=False).replace('\n', '\n  ') for e in entries)
    head = text[:end].rstrip()
    new = head + ',\n' + body + '\n]\n'
    names = [e['name'] for e in json.loads(new)]
    if len(names) != len(set(names)):
        sys.exit('duplicate entry names in ' + target)
    with open(target, 'w', encoding='utf-8') as fh:
        fh.write(new)
    print(f'{target}: {len(entries)} entries appended, {len(names)} in all')


if __name__ == '__main__':
    main()
