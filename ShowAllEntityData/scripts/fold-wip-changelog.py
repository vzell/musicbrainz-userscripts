#!/usr/bin/env python3
"""Fold ShowAllEntityData_CHANGELOG.wip.json into the real changelog.

`ShowAllEntityData/CLAUDE.md` puts version bumps and
`ShowAllEntityData_CHANGELOG.json` entries on `main` ONLY, so a feature
branch records its work as placeholder `WIP.N` entries instead. This script
is the merge-time other half of that rule — the `merge-push-remove` skill's
step 3.

It performs the five steps CLAUDE.md's "At merge time (on `main`)" list
names, in order:

  1. Assign real version numbers, OLDEST WIP FIRST. The WIP file is stored
     newest-first (`WIP.10` at the top), so entries are sorted by their
     numeric suffix ascending before numbering — otherwise the whole block
     lands in reverse chronological nonsense.
  2. Rewrite `WIP.N` cross-references inside the entry TEXT, not just in the
     `version` fields. Entries routinely read "Same root cause as WIP.6" or
     "the WIP.1 artifact purge"; leaving those behind ships a dangling
     placeholder that no test catches. Substitution is longest-token-first
     so `WIP.10` is never mangled by the `WIP.1` rule, and an unknown
     reference is a hard error rather than a silent pass-through.
  3. Prepend the folded entries newest-first, keeping each one's own `date`
     verbatim — a WIP entry is dated when it was written, not when it ships.
  4. Bump `// @version` in the userscript header to the highest assigned
     number, formatted `M.MM.NNN+YYYY-MM-DD`.
  5. Delete `ShowAllEntityData_CHANGELOG.wip.json`.

Dry-run by default: prints the mapping, the cross-reference rewrites and the
version bump, and touches nothing. Pass --apply to write.

Usage:
    python3 scripts/fold-wip-changelog.py            # preview
    python3 scripts/fold-wip-changelog.py --apply
    python3 scripts/fold-wip-changelog.py --apply --date 2026-09-05
    python3 scripts/fold-wip-changelog.py --project-dir /path/to/copy

`--apply` leaves the WIP file deleted from the working tree but stages
nothing; `git add -A` and commit yourself (the skill's step 5).
"""

import argparse
import datetime
import json
import pathlib
import re
import sys

CHANGELOG = 'ShowAllEntityData_CHANGELOG.json'
WIP = 'ShowAllEntityData_CHANGELOG.wip.json'
USERSCRIPT = 'ShowAllEntityData.user.js'

WIP_VERSION_RE = re.compile(r'^WIP\.(\d+)$')
WIP_REF_RE = re.compile(r'\bWIP\.(\d+)\b')
# Matches the userscript header line, e.g. "// @version      9.99.1014+2026-09-05".
HEADER_VERSION_RE = re.compile(r'^(//\s*@version\s+)(\d+\.\d+\.\d+)(\+\d{4}-\d{2}-\d{2})?\s*$')
RELEASE_VERSION_RE = re.compile(r'^(\d+)\.(\d+)\.(\d+)$')


def read_json(path):
    """Loads a JSON file, failing loudly with the path on a syntax error."""
    try:
        return json.loads(path.read_text(encoding='utf-8'))
    except json.JSONDecodeError as exc:
        sys.exit(f'error: {path.name} is not valid JSON: {exc}')


def dump_json(data):
    """Serialises exactly as the committed changelog is formatted.

    Verified byte-identical on a load/dump round trip of the real file, so a
    fold's diff shows only the entries it actually added.
    """
    return json.dumps(data, ensure_ascii=False, indent=2) + '\n'


def read_header_version(text):
    """Returns (line_index, prefix, version) for the userscript's own @version.

    Only the FIRST @version line is ours — the attribution block quotes the
    third-party scripts' versions further down the header.
    """
    for i, line in enumerate(text.splitlines()):
        m = HEADER_VERSION_RE.match(line)
        if m:
            return i, m.group(1), m.group(2)
    sys.exit(f'error: no "// @version" line found in {USERSCRIPT}')


def next_versions(latest, count):
    """Numbers `count` releases after `latest`, incrementing the patch field."""
    m = RELEASE_VERSION_RE.match(latest)
    if not m:
        sys.exit(f'error: cannot parse version "{latest}" as M.MM.NNN')
    major, minor, patch = (int(g) for g in m.groups())
    return [f'{major}.{minor}.{patch + n}' for n in range(1, count + 1)]


def sorted_wip_entries(entries):
    """Sorts WIP entries oldest-first by their numeric suffix.

    The file itself is newest-first; relying on its order would number the
    entries backwards.
    """
    keyed = []
    for entry in entries:
        raw = entry.get('version', '')
        m = WIP_VERSION_RE.match(str(raw))
        if not m:
            sys.exit(f'error: {WIP} entry has version "{raw}", expected "WIP.<n>"')
        keyed.append((int(m.group(1)), entry))
    numbers = [n for n, _ in keyed]
    if len(set(numbers)) != len(numbers):
        sys.exit(f'error: duplicate WIP numbers in {WIP}: {sorted(numbers)}')
    keyed.sort(key=lambda pair: pair[0])
    return keyed


def rewrite_refs(value, mapping, log):
    """Recursively rewrites every `WIP.N` token in a JSON value's strings.

    Walks the whole entry rather than a known list of fields, so a reference
    in a section label or a future key is caught too.
    """
    if isinstance(value, str):
        def sub(m):
            key = f'WIP.{m.group(1)}'
            if key not in mapping:
                sys.exit(f'error: dangling cross-reference "{key}" — no such WIP entry')
            log.append((key, mapping[key]))
            return mapping[key]
        return WIP_REF_RE.sub(sub, value)
    if isinstance(value, list):
        return [rewrite_refs(v, mapping, log) for v in value]
    if isinstance(value, dict):
        return {k: rewrite_refs(v, mapping, log) for k, v in value.items()}
    return value


def main():
    parser = argparse.ArgumentParser(description=__doc__,
                                     formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('--apply', action='store_true',
                        help='write the changes (default: preview only)')
    parser.add_argument('--date', default=None,
                        help='date for the @version suffix (default: today)')
    parser.add_argument('--project-dir', default=None,
                        help='project directory (default: the script\'s parent)')
    args = parser.parse_args()

    root = pathlib.Path(args.project_dir) if args.project_dir \
        else pathlib.Path(__file__).resolve().parent.parent
    wip_path = root / WIP
    changelog_path = root / CHANGELOG
    userscript_path = root / USERSCRIPT

    if not wip_path.exists():
        print(f'{WIP} does not exist — nothing to fold.')
        print('That is the expected state for a branch with no user-visible '
              'change (tests/ and scripts/ need no version bump).')
        return 0
    for path in (changelog_path, userscript_path):
        if not path.exists():
            sys.exit(f'error: {path} not found — wrong --project-dir?')

    stamp = args.date or datetime.date.today().isoformat()

    wip_entries = read_json(wip_path)
    changelog = read_json(changelog_path)
    if not isinstance(wip_entries, list) or not wip_entries:
        sys.exit(f'error: {WIP} is not a non-empty JSON array')
    if not isinstance(changelog, list) or not changelog:
        sys.exit(f'error: {CHANGELOG} is not a non-empty JSON array')

    latest = str(changelog[0].get('version', ''))
    source = userscript_path.read_text(encoding='utf-8')
    line_no, prefix, header_version = read_header_version(source)
    if header_version != latest:
        print(f'warning: header @version ({header_version}) and newest changelog '
              f'entry ({latest}) disagree; numbering from the changelog.',
              file=sys.stderr)

    # Step 1 — oldest WIP gets the lowest new version.
    ordered = sorted_wip_entries(wip_entries)
    assigned = next_versions(latest, len(ordered))
    mapping = {f'WIP.{num}': ver for (num, _), ver in zip(ordered, assigned)}

    # Step 2 — rewrite cross-references, then stamp the real version.
    ref_log = []
    folded = []
    for (num, entry), version in zip(ordered, assigned):
        # The entry's OWN `version` field is replaced outright, never counted
        # as a cross-reference — otherwise every entry inflates the tally by
        # one and the interesting number (references buried in prose) is lost
        # in the noise. Key order is preserved so the diff stays minimal.
        rewritten = {
            key: version if key == 'version' else rewrite_refs(val, mapping, ref_log)
            for key, val in entry.items()
        }
        rewritten.setdefault('version', version)
        folded.append(rewritten)

    highest = assigned[-1]
    new_header = f'{prefix}{highest}+{stamp}'

    print(f'{CHANGELOG}: newest entry {latest} -> folding {len(folded)} WIP entries')
    for (num, _), version in zip(ordered, assigned):
        print(f'  WIP.{num:<3} -> {version}')
    if ref_log:
        print(f'cross-references rewritten in entry text: {len(ref_log)}')
        for key, version in ref_log:
            print(f'  {key} -> {version}')
    else:
        print('cross-references rewritten in entry text: none')
    print(f'{USERSCRIPT}:{line_no + 1}  @version {header_version} -> {highest}+{stamp}')

    if not args.apply:
        print('\nDry run — nothing written. Re-run with --apply.')
        return 0

    # Step 3 — prepend newest-first.
    changelog_path.write_text(dump_json(list(reversed(folded)) + changelog),
                              encoding='utf-8')
    # Step 4 — bump the header.
    lines = source.splitlines(keepends=True)
    ending = '\n' if lines[line_no].endswith('\n') else ''
    lines[line_no] = new_header + ending
    userscript_path.write_text(''.join(lines), encoding='utf-8')
    # Step 5 — the WIP file has served its purpose.
    wip_path.unlink()

    print(f'\nWrote {CHANGELOG}, bumped {USERSCRIPT}, removed {WIP}.')
    print('Now: node --check, npm test, then git add -A && git commit.')
    return 0


if __name__ == '__main__':
    sys.exit(main())
