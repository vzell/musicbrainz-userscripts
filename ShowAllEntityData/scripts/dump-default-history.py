"""Walk the userscript's git history and record every change to a `default:`.

org/config-handling.org F1: VZ_MBLibrary's SAVE handler iterates the whole
schema rather than a dirty-set, so the first time a user presses SAVE — even
having changed nothing — every setting freezes into their GM storage and no
default shipped afterwards ever reaches them again.

Undoing that for an existing profile needs one fact this repo did not record:
**which defaults changed on an EXISTING setting, and what they changed FROM.**
A stored value equal to a historical default is one we can argue was frozen by
a SAVE rather than chosen; a stored value equal to nothing we ever shipped is
the user's own and must be left alone. That distinction is the whole of the
migration table in `ShowAllEntityData.user.js`, and it is not derivable from
the working tree.

**An endpoint diff is not good enough, and the org file's own numbers show
why.** F1 measured 9.99.746 against 9.99.1129 and reported five stuck defaults.
Walking every revision finds **ten**. The three it missed from `bfb8ac3` alone
are settings that were ADDED after 746 and whose default then changed before
1129 — to a two-point diff those read as "added", not "changed", so the frozen
old value is invisible. `sa_uniq_dropdown_visible_rows` is one of them, which
is F4's own worked example. Two more (`sa_auto_resize_columns_threshold`,
`sa_ui_row_hover_bg`) changed before 746 entirely.

Reuses `dump-config-defaults.py`'s parser — the one that brace-counts in CODE
state only, and so does not stop 24 entries early on a `}` inside a description
string, and does not drop the last entry for want of a trailing comma.

The output is committed as `scripts/config-default-history.json` and read by
`scripts/audit-config-defaults.py` Stage 3, which fails when a `default:`
change has no migration entry behind it. The audit does NOT re-walk git — it
compares this file's `current` block against the working tree, which is O(1)
and catches exactly the case that matters: a default changed since this file
was last refreshed.

usage:
  python3 scripts/dump-default-history.py            # refresh the committed JSON
  python3 scripts/dump-default-history.py --print    # human-readable, write nothing
"""
import argparse
import importlib.util
import json
import os
import subprocess
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
REPO = os.path.dirname(ROOT)
PATH = 'ShowAllEntityData/ShowAllEntityData.user.js'
DEFAULT_OUT = os.path.join(ROOT, 'scripts', 'config-default-history.json')

_spec = importlib.util.spec_from_file_location(
    'dumpcfg', os.path.join(ROOT, 'scripts', 'dump-config-defaults.py'))
dumpcfg = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(dumpcfg)

# Entry types that carry no user-settable value, so no default to track.
_NON_VALUE_TYPES = ('divider', 'function', 'table')


def revisions():
    """Every revision that touched the userscript, oldest first."""
    out = subprocess.run(
        ['git', 'log', '--follow', '--reverse', '--format=%H\t%ad', '--date=short',
         '--', PATH],
        cwd=REPO, capture_output=True, text=True, check=True).stdout
    rows = []
    for line in out.splitlines():
        if not line.strip():
            continue
        sha, date = line.split('\t')
        rows.append((sha, date))
    return rows


def source_at(sha):
    r = subprocess.run(['git', 'show', f'{sha}:{PATH}'],
                       cwd=REPO, capture_output=True, text=True)
    return r.stdout if r.returncode == 0 else None


def defaults_at(src):
    """{key: {'default': …, 'type': …}} for every entry carrying a `default:`."""
    entries, _block = dumpcfg.parse_config_schema(src)
    out = {}
    for key, cfg in entries:
        if cfg.get('type') in _NON_VALUE_TYPES:
            continue
        if 'default' not in cfg:
            continue
        out[key] = {'default': cfg['default'], 'type': cfg.get('type')}
    return out


def walk():
    """Replay every revision, collecting default changes, survivors and strays."""
    revs = revisions()
    prev = None
    changes = []
    ever = {}
    unparseable = []

    for sha, date in revs:
        src = source_at(sha)
        if src is None:
            continue
        try:
            cur = defaults_at(src)
            ver = dumpcfg.script_version(src)
        except Exception as exc:                                  # noqa: BLE001
            # A revision mid-refactor can legitimately not parse. Recorded
            # rather than swallowed: a long run of these would mean the parser
            # has drifted from the file, not that the history is quiet.
            unparseable.append({'sha': sha[:8], 'date': date, 'error': str(exc)})
            continue
        for key, cfg in cur.items():
            ever[key] = {'last_version': ver, 'last_date': date,
                         'last_default': cfg['default'], 'type': cfg['type']}
        if prev is not None:
            for key, cfg in cur.items():
                if key in prev and prev[key]['default'] != cfg['default']:
                    changes.append({
                        'sha': sha[:8], 'date': date, 'version': ver, 'key': key,
                        'type': cfg['type'],
                        'from': prev[key]['default'], 'to': cfg['default'],
                    })
        prev = cur

    current = prev or {}

    # Every value this key ever shipped as a default that is NOT the current
    # one. A stored value matching one of these is what a SAVE froze.
    stale = {}
    for c in changes:
        key = c['key']
        if key not in current:
            continue                      # removed later — an orphan, not stale
        now = current[key]['default']
        for v in (c['from'], c['to']):
            if v == now:
                continue
            stale.setdefault(key, {'type': current[key]['type'],
                                   'current': now, 'was': []})
            if v not in stale[key]['was']:
                stale[key]['was'].append(v)

    orphans = {k: v for k, v in ever.items() if k not in current}

    return {
        'revisions': len(revs),
        'changes': changes,
        'current': {k: v['default'] for k, v in current.items()},
        'stale': stale,
        'orphans': orphans,
        'unparseable': unparseable,
    }


def main():
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument('--out', default=DEFAULT_OUT, help='output path')
    ap.add_argument('--print', dest='show', action='store_true',
                    help='print the result and write nothing')
    args = ap.parse_args()

    data = walk()

    head = subprocess.run(['git', 'rev-parse', 'HEAD'], cwd=REPO,
                          capture_output=True, text=True, check=True).stdout.strip()

    payload = {
        '_meta': {
            'generated_by': 'scripts/dump-default-history.py',
            'source': PATH,
            'head': head,
            'revisions_walked': data['revisions'],
        },
        'changes': data['changes'],
        'stale': data['stale'],
        'orphans': data['orphans'],
        'current': data['current'],
    }

    if data['unparseable']:
        payload['_meta']['unparseable_revisions'] = data['unparseable']

    if args.show:
        print(f'{data["revisions"]} revisions walked, '
              f'{len(data["changes"])} default changes\n')
        print(f'{len(data["stale"])} settings whose current default is not the '
              f'only one ever shipped:')
        for key, info in sorted(data['stale'].items()):
            was = ', '.join(json.dumps(v) for v in info['was'])
            print(f'  {key:<44} {info["type"]:<14} {was} -> '
                  f'{json.dumps(info["current"])}')
        print(f'\n{len(data["orphans"])} keys that were in the schema once and '
              f'are gone now:')
        for key, info in sorted(data['orphans'].items()):
            print(f'  {key:<44} last seen {info["last_version"]} '
                  f'({info["last_date"]}), default '
                  f'{json.dumps(info["last_default"])}')
        if data['unparseable']:
            print(f'\n{len(data["unparseable"])} revisions did not parse')
        return 0

    with open(args.out, 'w', encoding='utf-8') as fh:
        json.dump(payload, fh, indent=2, ensure_ascii=False)
        fh.write('\n')
    print(f'wrote {os.path.relpath(args.out, ROOT)} — '
          f'{data["revisions"]} revisions, {len(data["changes"])} default changes, '
          f'{len(data["stale"])} stale, {len(data["orphans"])} orphaned')
    return 0


if __name__ == '__main__':
    sys.exit(main())
