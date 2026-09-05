"""One-time repair of two data defects in ShowAllEntityData_CHANGELOG.json.

Both predate `scripts/fold-wip-changelog.py` and are exactly what it now
prevents. Committed rather than run and thrown away, because it is the record
of which shipped release notes were edited and on what evidence.

1. UNRESOLVED `WIP.N` PLACEHOLDERS, left behind by hand-folds that rewrote the
   `version` fields but not the cross-references buried in prose.

   - 9.99.932's "WIP.1" resolves to **9.99.931**. Confirmed twice: 9.99.931 is
     the entry that introduced `window.__saTest`, which is what the sentence
     cites, and replaying that fold's own WIP file (`git show
     18faad8^:…wip.json`, six entries numbered oldest-first from 9.99.931)
     maps WIP.1 -> 9.99.931 exactly.

   - 9.99.783's "WIP.26" resolves to **nothing at all**, so the citation is
     deleted rather than repointed. WIP.26 never existed in any committed WIP
     file: the pre-fold file jumps WIP.25 -> WIP.27 (`git show
     1b96eb0^:…wip.json`), no commit in the repository's history has ever
     contained a `"WIP.26"`, and no shipped entry introduces the
     "Phonographic copyright (℗) by artist/label" columns the sentence points
     at — the commit that first put that column name in the userscript
     (3ec4a40) is the very commit this entry describes. It was a
     mis-numbered reference from the moment it was written. Inventing a
     target would be worse than dropping one.

2. TWO ENTRIES WITH NO `version` FIELD, which make any tool that reads
   `entry['version']` bail. The changelog is strictly newest-first, so each
   sits in exactly one free slot:

   - index 969, dated 2026-03-06, between 9.99.46 and 9.99.44 -> **9.99.45**.
     Unambiguous: one integer slot, unused anywhere else.
   - index 1037, dated 2026-02-24, between 9.91.0 and 9.90.0 -> **9.90.1**.
     RECONSTRUCTED, not recovered: its neighbours are all `9.9x.0`, no
     integer fits between 90 and 91, and both entries entered git in the
     initial import (35a605d) so no earlier `@version` records the truth.
     9.90.1 is the only value that keeps the sequence strictly descending
     without colliding.

Idempotent: re-running after a successful pass reports nothing left to do.

    python3 scripts/repair-changelog-placeholders.py            # preview
    python3 scripts/repair-changelog-placeholders.py --apply
"""

import argparse
import json
import pathlib
import re
import sys

CHANGELOG = 'ShowAllEntityData_CHANGELOG.json'

# version -> {old placeholder: replacement}. An empty replacement deletes the
# parenthesised citation along with its surrounding space.
WIP_FIXES = {
    '9.99.932': {'WIP.1': '9.99.931'},
    '9.99.783': {'WIP.26': None},          # None = delete the citation entirely
}

# index -> version, for entries that never had one.
MISSING_VERSIONS = {
    969: ('9.99.45', '2026-03-06'),
    1037: ('9.90.1', '2026-02-24'),
}


def fix_text(text, mapping):
    """Applies one entry's placeholder fixes to a single item string."""
    out = text
    for old, new in mapping.items():
        if new is None:
            # " (WIP.26)" -> "", and a bare "WIP.26" -> "" as a fallback.
            out = re.sub(rf'\s*\({re.escape(old)}\)', '', out)
            out = re.sub(rf'\s*\b{re.escape(old)}\b', '', out)
        else:
            out = re.sub(rf'\b{re.escape(old)}\b', new, out)
    return out


def walk_items(entry):
    """Yields (section, index, text, setter) for every item, both item shapes."""
    for sec in entry.get('sections', []):
        for i, it in enumerate(sec.get('items', [])):
            if isinstance(it, str):
                yield it, (lambda s, _sec=sec, _i=i: _sec['items'].__setitem__(_i, s))
            elif isinstance(it, dict) and isinstance(it.get('text'), str):
                yield it['text'], (lambda s, _it=it: _it.__setitem__('text', s))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--apply', action='store_true', help='write the changes (default: preview)')
    args = ap.parse_args()

    root = pathlib.Path(__file__).resolve().parent.parent
    path = root / CHANGELOG
    data = json.loads(path.read_text(encoding='utf-8'))

    changes = []

    # 1. Placeholder rewrites.
    for entry in data:
        mapping = WIP_FIXES.get(str(entry.get('version')))
        if not mapping:
            continue
        for text, setter in walk_items(entry):
            fixed = fix_text(text, mapping)
            if fixed != text:
                changes.append(f'{entry["version"]}: ' + ' | '.join(
                    f'{k} -> {v if v else "(citation removed)"}' for k, v in mapping.items()))
                if args.apply:
                    setter(fixed)

    # 2. Missing version fields, inserted FIRST so key order matches every
    #    other entry ({version, date, sections}).
    for idx, (version, expect_date) in MISSING_VERSIONS.items():
        if idx >= len(data):
            sys.exit(f'error: index {idx} out of range — changelog has {len(data)} entries')
        entry = data[idx]
        if 'version' in entry:
            continue                                    # already repaired
        if entry.get('date') != expect_date:
            sys.exit(f'error: index {idx} is dated {entry.get("date")}, expected {expect_date} '
                     f'— the changelog shifted; re-derive the indices before running this')
        changes.append(f'index {idx} ({entry.get("date")}): version -> {version}')
        if args.apply:
            data[idx] = {'version': version, **entry}

    if not changes:
        print('Nothing to repair — the changelog is already clean.')
        return 0
    for c in changes:
        print(f'  {c}')

    if not args.apply:
        print('\nPreview only. Re-run with --apply.')
        return 0

    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(f'\nWrote {CHANGELOG}.')
    return 0


if __name__ == '__main__':
    sys.exit(main())
