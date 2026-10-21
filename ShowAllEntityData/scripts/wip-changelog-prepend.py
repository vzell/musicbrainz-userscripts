#!/usr/bin/env python3
"""Prepend one entry to ShowAllEntityData_CHANGELOG.wip.json.

usage: python3 scripts/wip-changelog-prepend.py <entry.json>

<entry.json> holds one changelog entry ({"version": "WIP.N", "date": …,
"sections": […]}). The entry is inserted as text before the first existing
one, so the rest of the file keeps its formatting byte for byte; the result
is parsed back to make sure it is still valid JSON, and the version must not
be in the file already.
"""
import json
import sys

WIP = 'ShowAllEntityData_CHANGELOG.wip.json'


def main(entry_path):
    """Prepend the entry in `entry_path` to the WIP changelog."""
    entry = json.load(open(entry_path, encoding='utf-8'))
    text = open(WIP, encoding='utf-8').read()
    if any(e.get('version') == entry['version'] for e in json.loads(text)):
        sys.exit(f'{entry["version"]} is already in {WIP}')
    body = json.dumps(entry, ensure_ascii=False, indent=2)
    block = '\n'.join('  ' + line for line in body.splitlines())
    start = text.index('[') + 1
    out = text[:start] + '\n' + block + ',' + text[start:]
    json.loads(out)
    open(WIP, 'w', encoding='utf-8').write(out)
    print(f'prepended {entry["version"]}')


if __name__ == '__main__':
    main(sys.argv[1])
