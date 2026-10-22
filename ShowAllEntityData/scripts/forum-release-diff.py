"""Collect the raw material for one FORUM.org "Changes since last version" section.

Written for the 9.99.1271 -> 9.99.1356 section (2026-10-15) and used by the
`forum-section` skill. FORUM.org is the end-user announcement for the
community.metabrainz.org support thread; each release adds one section that
opens with "Your settings and this update". That opening needs numbers nobody
should count by hand:

  - how many settings were ADDED and REMOVED between the two releases, and in
    which ⚙️ Settings section each one appears (by its dialog label, since the
    forum post names settings by label, never by key);
  - which sections are new;
  - which `default:` values changed, and whether each is listed in
    `_SETTINGS_MIGRATIONS`. Since 9.99.1137 SAVE stores only the settings that
    differ from their default, and the one-time repair (migration level 1)
    has run for anyone who has used a release since, so a default change now
    reaches every user who has not set that setting themselves. The listing
    only matters for a profile still frozen by a SAVE from before 9.99.1137;
    `_SETTINGS_MIGRATION_LEVEL` is not raised per release, so check it
    before claiming more;
  - which sections and settings were RENAMED (same key, new dialog label),
    since the post must name them as the dialog shows them now.

It also prints every changelog entry in (FROM, TO], oldest first, so the
writer reads the shipped history in the order it happened.

The schema is parsed with scripts/dump-config-defaults.py's own parser, at
each release's fold commit, so the counts are what each release actually
shipped rather than what the working tree says now.

usage:
  python3 scripts/forum-release-diff.py 9.99.1271 9.99.1356
  python3 scripts/forum-release-diff.py 9.99.1271 9.99.1356 --no-changelog
"""
import argparse
import importlib.util
import json
import os
import re
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
USERSCRIPT = 'ShowAllEntityData.user.js'
CHANGELOG = 'ShowAllEntityData_CHANGELOG.json'

_spec = importlib.util.spec_from_file_location(
    'dump_config_defaults', os.path.join(HERE, 'dump-config-defaults.py'))
dcd = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(dcd)


def git(*args):
    """Run git in the project directory and return its stdout."""
    return subprocess.run(['git', *args], cwd=ROOT, check=True,
                          capture_output=True, text=True).stdout


def release_commit(version):
    """Return the oldest commit whose userscript header carries `version`.

    That is the fold commit on main ("docs: bump to X, fold WIP changelog").
    """
    out = git('log', '--format=%H', '-S', f'@version      {version}+',
              '--', USERSCRIPT).split()
    if not out:
        sys.exit(f'no commit introduces // @version {version}')
    return out[-1]


def schema_at(rev):
    """Return (sections-by-key, settings-in-order) of configSchema at `rev`.

    Each setting is (key, fields, section label); a setting belongs to the
    nearest `type: 'divider'` entry above it.
    """
    src = git('show', f'{rev}:ShowAllEntityData/{USERSCRIPT}')
    entries, _ = dcd.parse_config_schema(src)
    section, settings, sections = '', [], {}
    for key, fields in entries:
        if fields.get('type') == 'divider':
            section = fields.get('label', key)
            sections[key] = section
        else:
            settings.append((key, fields, section))
    return sections, settings, src


def migrations(src):
    """Return the keys listed in `_SETTINGS_MIGRATIONS` in `src`."""
    m = re.search(r'const _SETTINGS_MIGRATIONS = \[(.*?)\n    \];', src, re.S)
    return set(re.findall(r"key:\s*'([^']+)'", m.group(1))) if m else set()


def fmt(v):
    """Render a default value compactly."""
    return json.dumps(v, ensure_ascii=False)


def main():
    """Print the settings diff and the changelog entries between two releases."""
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument('frm', help='previous release, e.g. 9.99.1271')
    ap.add_argument('to', help='this release, e.g. 9.99.1356')
    ap.add_argument('--no-changelog', action='store_true',
                    help='print only the settings diff')
    args = ap.parse_args()

    a_rev, b_rev = release_commit(args.frm), release_commit(args.to)
    a_sec, a_set, _ = schema_at(a_rev)
    b_sec, b_set, b_src = schema_at(b_rev)
    a_map = {k: (f, s) for k, f, s in a_set}
    b_map = {k: (f, s) for k, f, s in b_set}
    migr = migrations(b_src)

    print(f'FROM {args.frm} @ {a_rev[:7]}  ->  TO {args.to} @ {b_rev[:7]}')
    print(f'settings: {len(a_set)} -> {len(b_set)}; '
          f'sections: {len(a_sec)} -> {len(b_sec)}\n')

    new_secs = [b_sec[k] for k in b_sec if k not in a_sec]
    gone_secs = [a_sec[k] for k in a_sec if k not in b_sec]
    print(f'## Sections added ({len(new_secs)})')
    for s in new_secs:
        print(f'  + {s}')
    print(f'## Sections removed ({len(gone_secs)})')
    for s in gone_secs:
        print(f'  - {s}')

    added = [(k, f, s) for k, f, s in b_set if k not in a_map]
    removed = [(k, f, s) for k, f, s in a_set if k not in b_map]
    print(f'\n## Settings added ({len(added)})')
    for k, f, s in added:
        dflt = fmt(f['default']) if 'default' in f else '(table, seeded)'
        print(f'  + [{s}] {f.get("label", "")!s}  ({k}, default {dflt})')
    print(f'\n## Settings removed ({len(removed)})')
    for k, f, s in removed:
        print(f'  - [{s}] {f.get("label", "")}  ({k})')

    print('\n## Sections renamed')
    for k in b_sec:
        if k in a_sec and a_sec[k] != b_sec[k]:
            print(f'  ~ {a_sec[k]}  ->  {b_sec[k]}')
    print('\n## Settings renamed')
    for k, f, s in b_set:
        if k in a_map and a_map[k][0].get('label') != f.get('label'):
            print(f'  ~ [{s}] {a_map[k][0].get("label", "")}  ->  '
                  f'{f.get("label", "")}  ({k})')

    print('\n## Defaults changed (existing settings only)')
    for k, f, s in b_set:
        if k not in a_map:
            continue
        old, new = a_map[k][0].get('default'), f.get('default')
        if old != new:
            how = ('in _SETTINGS_MIGRATIONS' if k in migr
                   else 'NOT in _SETTINGS_MIGRATIONS: a profile frozen by a '
                        'pre-9.99.1137 SAVE keeps the old value')
            print(f'  * [{s}] {f.get("label", "")}  ({k}): '
                  f'{fmt(old)} -> {fmt(new)}  [{how}]')

    if args.no_changelog:
        return 0

    a_n, b_n = (int(v.rsplit('.', 1)[1]) for v in (args.frm, args.to))
    log = json.load(open(os.path.join(ROOT, CHANGELOG), encoding='utf-8'))
    picked = [e for e in log
              if e['version'].startswith('9.99.')
              and a_n < int(e['version'].rsplit('.', 1)[1]) <= b_n]
    print(f'\n## Changelog entries ({len(picked)}), oldest first')
    for e in reversed(picked):
        print(f'\n### {e["version"]} ({e["date"]})')
        for sec in e.get('sections', []):
            for item in sec.get('items', []):
                print(f'  {sec.get("label", "")} {item}')
    return 0


if __name__ == '__main__':
    sys.exit(main())
