#!/usr/bin/env python3
"""Walk every revision of the userscript and record the BUILT-IN rows of the
five `type: 'table'` settings.

org/config-handling.org F1's closing note: those five are lazy-seeded from code
on first use and never reconsult the built-ins, so a row shipped in a later
version never reaches anyone who already has the table. The fix needs a ledger
of "which built-in rows has this profile already been offered" — and before
building one it is worth knowing whether the built-ins have EVER changed, and
in which direction. A mechanism for a thing that has never happened is a
different proposal from one for a thing that happens every few weeks.

Same shape and the same reason as `dump-default-history.py`, which does this
for `configSchema`'s `default:` values: a two-point diff cannot see a row that
was added and later removed, and reads a row added after the older endpoint as
"always been there".

The five tables and where their built-ins live:

  sa_default_hidden_columns        SA_DEFAULT_HIDDEN_COLUMNS_DEFAULT (array of
                                   objects, `pageType` is the key)
  sa_unicode_char_picker_mappings  SA_UNICODE_CHARS_DEFAULT (array of objects,
                                   `code` is the key)
  sa_rel_url_icon_classes          REL_URL_ICON_CLASSES_DEFAULT   (object,
  sa_rel_other_db_classes          REL_OTHER_DB_CLASSES_DEFAULT    the key is
  sa_rel_streaming_classes         REL_STREAMING_CLASSES_DEFAULT   the key)

**The three rel maps are read TWO ways, and both are needed.** Before 9.99.1142
they had no named constant at all: the built-ins were an inline object literal
passed as the second argument of a `_loadMap('<key>', { ... })` call inside
`_initRelMappings()` — duplicated from the `let REL_*` initializer, which is
what the hoist to one constant each fixed. A walk over HISTORY therefore meets
both shapes, so this tries the constant first and falls back to the call site.

Reading only the new shape is not a theoretical loss: it is what this script
did for one commit, and the failure was SILENT. The three tables simply stopped
appearing, the change loop iterates the tables it found rather than the ones it
expected, and a table vanishing produced no output at all — so the headline
"0 changes" stayed true by luck rather than by measurement. Hence
`EXPECTED_TABLES` and the explicit complaint below.

Keys only — a row's VALUE changing is a different question from a row
appearing, and only the second one is what the ledger has to answer.

    python3 scripts/dump-table-seed-history.py
    python3 scripts/dump-table-seed-history.py --json scripts/table-seed-history.json
"""

import argparse
import json
import pathlib
import re
import subprocess
import sys

SCRIPT = 'ShowAllEntityData/ShowAllEntityData.user.js'

# `_loadMap('sa_rel_url_icon_classes', {` … matching `}`
LOADMAP = re.compile(r"_loadMap\(\s*'(sa_rel_[a-z_]+)'\s*,\s*\{")
# A quoted key at the start of an object-literal entry: 'discogs': 'discogs',
OBJ_KEY = re.compile(r"^\s*'((?:[^'\\]|\\.)*)'\s*:", re.MULTILINE)
# `pageType: 'release-tracks'` / `code: '’'` inside an array of objects.
FIELD = r"{0}:\s*'((?:[^'\\]|\\.)*)'"

ARRAY_TABLES = {
    'sa_default_hidden_columns': ('SA_DEFAULT_HIDDEN_COLUMNS_DEFAULT', 'pageType'),
    'sa_unicode_char_picker_mappings': ('SA_UNICODE_CHARS_DEFAULT', 'code'),
}

# The three rel maps, as of 9.99.1142. Older revisions have no such constant and
# are read from the _loadMap() call site instead — see the module docstring.
OBJECT_TABLES = {
    'sa_rel_url_icon_classes': 'REL_URL_ICON_CLASSES_DEFAULT',
    'sa_rel_other_db_classes': 'REL_OTHER_DB_CLASSES_DEFAULT',
    'sa_rel_streaming_classes': 'REL_STREAMING_CLASSES_DEFAULT',
}

# Every table this script must find in the CURRENT revision. A table that has
# quietly stopped parsing is the failure mode worth shouting about: the change
# loop compares the tables it found, so one that disappears is reported as
# nothing at all.
EXPECTED_TABLES = set(ARRAY_TABLES) | set(OBJECT_TABLES)


def repo_root():
    done = subprocess.run(['git', 'rev-parse', '--show-toplevel'],
                          capture_output=True, text=True, check=True)
    return pathlib.Path(done.stdout.strip())


def revisions(root):
    """Every commit that touched the userscript, oldest first."""
    done = subprocess.run(
        ['git', '-C', str(root), 'log', '--reverse', '--format=%H\t%ad\t%s',
         '--date=short', '--', SCRIPT],
        capture_output=True, text=True, check=True)
    out = []
    for line in done.stdout.splitlines():
        sha, date, subject = line.split('\t', 2)
        out.append({'sha': sha, 'date': date, 'subject': subject})
    return out


def blob(root, sha):
    done = subprocess.run(['git', '-C', str(root), 'show', f'{sha}:{SCRIPT}'],
                          capture_output=True, text=True)
    return done.stdout if done.returncode == 0 else None


def balanced_block(text, open_idx, open_ch='{', close_ch='}'):
    """The substring from `open_idx` to its matching close, naively brace-counted.

    Naive is right here: these literals hold no braces inside their string
    values (they are icon class names, hosts, single characters), and a real
    parser would be a large amount of machinery for a throwaway measurement.
    A wrong answer shows up as an absurd key count, not as silence.
    """
    depth = 0
    for i in range(open_idx, len(text)):
        if text[i] == open_ch:
            depth += 1
        elif text[i] == close_ch:
            depth -= 1
            if depth == 0:
                return text[open_idx:i + 1]
    return ''


def keys_in_revision(src):
    """{table key: [row keys]} for one revision of the userscript."""
    out = {}

    for setting, (const, field) in ARRAY_TABLES.items():
        m = re.search(rf'const {const} = \[', src)
        if not m:
            continue
        block = balanced_block(src, src.index('[', m.start()), '[', ']')
        out[setting] = re.findall(FIELD.format(field), block)

    # 9.99.1142 onwards: a named constant per rel map.
    for setting, const in OBJECT_TABLES.items():
        m = re.search(rf'const {const} = \{{', src)
        if not m:
            continue
        block = balanced_block(src, src.index('{', m.start()))
        out[setting] = OBJ_KEY.findall(block)

    # Before that: the literal lived at the _loadMap() call site. Only consulted
    # for a table the constant form did not already supply, so the two never
    # fight on a revision that happens to carry both.
    for m in LOADMAP.finditer(src):
        setting = m.group(1)
        if setting in out:
            continue
        block = balanced_block(src, src.index('{', m.end() - 1))
        out[setting] = OBJ_KEY.findall(block)

    return out


def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--json', default=None, help='also write the full record here')
    args = ap.parse_args()

    root = repo_root()
    revs = revisions(root)
    if not revs:
        sys.exit(f'error: no revisions found for {SCRIPT}')

    changes = []          # {setting, added, removed, sha, date, subject}
    prev = {}
    first_seen = {}       # setting -> revision index where it first appeared
    current = {}

    for idx, rev in enumerate(revs):
        src = blob(root, rev['sha'])
        if src is None:
            continue
        now = keys_in_revision(src)
        current = now
        for setting, keys in now.items():
            before = prev.get(setting)
            if before is None:
                first_seen.setdefault(setting, {
                    'sha': rev['sha'], 'date': rev['date'],
                    'subject': rev['subject'], 'rows': len(keys)})
                continue
            added = [k for k in keys if k not in before]
            removed = [k for k in before if k not in keys]
            if added or removed:
                changes.append({
                    'setting': setting, 'added': added, 'removed': removed,
                    'sha': rev['sha'], 'date': rev['date'],
                    'subject': rev['subject'],
                })
        prev = now

    print(f'{len(revs)} revisions of {SCRIPT}\n')
    print('Built-in row counts, now:')
    for setting in sorted(EXPECTED_TABLES):
        n = len(current.get(setting, []))
        intro = first_seen.get(setting, {})
        print(f'  {setting:<34} {n:>3} rows   (first seen {intro.get("date", "?")}'
              f' with {intro.get("rows", "?")})')

    # A table this script can no longer find is the failure that hides itself:
    # the change loop compares what it FOUND, so one that stops parsing is
    # reported as no changes rather than as an error. Exactly what happened
    # when the rel maps were hoisted to constants.
    missing = sorted(EXPECTED_TABLES - set(current))
    if missing:
        print(f'\nERROR: {len(missing)} table(s) did not parse in the current '
              f'revision: {", ".join(missing)}')
        print('The "changes" figure below is not trustworthy — it can only '
              'compare tables it found.')
        return 2

    print(f'\n{len(changes)} change(s) to the built-in rows after their introduction:')
    if not changes:
        print('  none — the built-in tables have never gained or lost a row.')
    for c in changes:
        bits = []
        if c['added']:
            bits.append(f'+{len(c["added"])} {c["added"]}')
        if c['removed']:
            bits.append(f'-{len(c["removed"])} {c["removed"]}')
        print(f'  {c["date"]}  {c["sha"][:9]}  {c["setting"]}  ' + '  '.join(bits))
        print(f'             {c["subject"][:100]}')

    if args.json:
        path = pathlib.Path(args.json)
        path.write_text(json.dumps({
            '_meta': {'revisions': len(revs), 'script': SCRIPT},
            'first_seen': first_seen,
            'changes': changes,
            'current': {k: sorted(v) for k, v in current.items()},
        }, indent=2, ensure_ascii=False), encoding='utf-8')
        print(f'\nwrote {path}')

    return 0


if __name__ == '__main__':
    sys.exit(main())
