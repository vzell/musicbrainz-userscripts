#!/usr/bin/env python3
"""Add one more edit (and a sentence to "why") to named entries of a scripts/mutations/*.json list, in place.

Used when a newer guard hides an older one from its spec: the older entry then plants both defects, so it
still proves its own guard. Rewrites only the named entries' text blocks, so the rest of the hand layout stays.

Usage:
    python3 scripts/mutation-add-edit.py <list.json> <edit.json> "<why sentence>" "<entry name>" ...
    edit.json: {"find": "...", "replace": "..."}
"""
import json
import sys


def main():
    """Rewrite the named entries and check the list still parses with the same names."""
    path, edit_path, why_add, *names = sys.argv[1:]
    edit = json.load(open(edit_path, encoding='utf-8'))
    text = open(path, encoding='utf-8').read()
    before = [e['name'] for e in json.loads(text)]
    for name in names:
        start = text.index('  {\n    "name": ' + json.dumps(name, ensure_ascii=False))
        end = text.index('\n  }', start) + len('\n  }')
        entry = json.loads(text[start:end])
        if edit not in entry['edits']:
            entry['edits'].append(edit)
            entry['why'] = entry['why'].rstrip() + ' ' + why_add
        block = '  ' + json.dumps(entry, indent=2, ensure_ascii=False).replace('\n', '\n  ')
        text = text[:start] + block + text[end:]
    after = [e['name'] for e in json.loads(text)]
    if before != after:
        sys.exit('entry names or order changed')
    open(path, 'w', encoding='utf-8').write(text)
    print(f'{path}: {len(names)} entries given the extra edit')


if __name__ == '__main__':
    main()
