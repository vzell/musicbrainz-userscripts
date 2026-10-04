"""Compare two config-default-history.json files field by field.

Written for the 2026-10-04 walk fix (fix/default-history-merge-walk): a change
to how scripts/dump-default-history.py walks git must not move `stale`,
`orphans` or `current` unless it is meant to, because those three are what
scripts/audit-config-defaults.py holds `_SETTINGS_MIGRATIONS` and
`_SETTINGS_ORPHANED_KEYS` against. `changes` is reported as a set difference,
since the old walk could record flips that no single line of history had.

usage:
  python3 scripts/compare-default-history.py OLD.json NEW.json
"""
import json
import sys


def _key(c):
    """A change entry's identity, ignoring the sha it was attributed to."""
    return (c['key'], json.dumps(c['from']), json.dumps(c['to']))


def main():
    """Print what differs between the two files; exit 1 if stale/orphans/current do."""
    old, new = (json.load(open(p, encoding='utf-8')) for p in sys.argv[1:3])
    print(f"revisions walked: {old['_meta']['revisions_walked']} -> "
          f"{new['_meta']['revisions_walked']}")
    oc, nc = {_key(c) for c in old['changes']}, {_key(c) for c in new['changes']}
    print(f"changes: {len(old['changes'])} -> {len(new['changes'])}")
    for k in sorted(oc - nc):
        print(f'  only in OLD: {k}')
    for k in sorted(nc - oc):
        print(f'  only in NEW: {k}')
    bad = False
    for field in ('stale', 'orphans', 'current'):
        same = old[field] == new[field]
        print(f'{field}: {"identical" if same else "DIFFERS"}')
        if not same:
            bad = True
            for k in sorted(set(old[field]) | set(new[field])):
                if old[field].get(k) != new[field].get(k):
                    print(f'  {k}: {json.dumps(old[field].get(k))} -> '
                          f'{json.dumps(new[field].get(k))}')
    return 1 if bad else 0


if __name__ == '__main__':
    sys.exit(main())
